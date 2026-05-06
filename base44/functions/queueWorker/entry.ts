import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Queue Worker — processes ScheduledOutreach jobs.
 * Called by scheduled automation every 5 minutes.
 * Also handles: process_single, get_status, webhook ingestion.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { action = 'process_queue' } = body;

    // ── PROCESS QUEUE ─────────────────────────────────────────────────────────
    if (action === 'process_queue') {
      // Auth: must be admin or called by automation
      const user = await base44.auth.me().catch(() => null);
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }

      // Load test_mode and daily limit from AppSetting (with graceful fallback)
      const settings = { test_mode: true, daily_email_limit: 100 };
      try {
        const settingsRecords = await base44.asServiceRole.entities.AppSetting.list('-created_date', 100);
        for (const r of settingsRecords) {
          try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
        }
      } catch (_) { /* defaults */ }
      const testMode = settings.test_mode !== false;
      const dailyLimit = Number(settings.daily_email_limit) || 100;

      // Count today's already-sent in test mode
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const sentToday = await base44.asServiceRole.entities.ScheduledOutreach.filter({ status: 'sent' });
      const sentTodayCount = sentToday.filter(j => j.last_attempt_at && new Date(j.last_attempt_at) >= todayStart).length;
      let remainingToday = Math.max(0, dailyLimit - sentTodayCount);

      const now = new Date();
      const results = { processed: 0, sent: 0, failed: 0, skipped: 0, paused: 0, test_mode: testMode };

      // Get all jobs scheduled to run now (status=scheduled, scheduled_for <= now)
      const jobs = await base44.asServiceRole.entities.ScheduledOutreach.filter({ status: 'scheduled' });
      const dueJobs = jobs.filter(j => j.scheduled_for && new Date(j.scheduled_for) <= now);

      for (const job of dueJobs.slice(0, 50)) { // process max 50 per run
        results.processed++;

        // Check account is still active (only if assigned)
        const account = job.sending_account_id
          ? await base44.asServiceRole.entities.SendingAccount.get(job.sending_account_id).catch(() => null)
          : null;

        if (account && (!account.is_active || ['blocked', 'paused', 'disconnected'].includes(account.health_status))) {
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { status: 'paused', last_error: 'Sending account paused or blocked' });
          results.paused++;
          continue;
        }

        // Daily limit check (system-wide setting OR per-account)
        if (remainingToday <= 0 || (account && account.sends_today >= account.daily_limit)) {
          // Reschedule to next day at 9am
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { scheduled_for: tomorrow.toISOString() });
          results.skipped++;
          continue;
        }

        // Mark as sending (job lock)
        await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, {
          status: 'sending', last_attempt_at: now.toISOString(),
          attempt_count: (job.attempt_count || 0) + 1,
        });

        // Get draft
        const draft = job.draft_id ? await base44.asServiceRole.entities.OutreachDraft.get(job.draft_id) : null;

        if (!draft || draft.status !== 'approved') {
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { status: 'skipped', last_error: 'Draft not approved or missing' });
          results.skipped++;
          continue;
        }

        // Execute based on channel
        let sendResult = { success: false, error: 'Unknown channel' };
        if (job.channel === 'email') {
          sendResult = await sendEmailJob(base44, job, draft, account, testMode);
          if (sendResult.success) remainingToday--;
        } else if (job.channel === 'linkedin') {
          // LinkedIn: never auto-send — create manual task
          sendResult = await createLinkedInTask(base44, job, draft);
        } else if (job.channel === 'sms') {
          sendResult = { success: false, error: 'SMS requires opt-in verification — use manual send' };
        } else if (job.channel === 'phone') {
          sendResult = await createCallTask(base44, job, draft);
        }

        if (sendResult.success) {
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, {
            status: 'sent', provider_message_id: sendResult.message_id || null,
          });
          // Update account usage
          if (account) {
            await base44.asServiceRole.entities.SendingAccount.update(account.id, {
              sends_today: (account.sends_today || 0) + 1,
              sends_rolling_24h: (account.sends_rolling_24h || 0) + 1,
              last_used_at: now.toISOString(),
            });
          }
          results.sent++;
        } else {
          const attempts = (job.attempt_count || 0) + 1;
          const maxAttempts = 3;
          if (attempts >= maxAttempts) {
            await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, {
              status: 'failed', last_error: sendResult.error,
            });
          } else {
            // Retry with exponential backoff
            const retryIn = Math.pow(2, attempts) * 5 * 60 * 1000; // 10min, 20min, 40min
            const retryAt = new Date(now.getTime() + retryIn);
            await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, {
              status: 'scheduled', scheduled_for: retryAt.toISOString(), last_error: sendResult.error,
            });
          }
          results.failed++;

          // Check if account should be auto-paused due to repeated failures
          if (account && attempts >= 2) {
            const recentFails = dueJobs.filter(j => j.sending_account_id === account.id && j.last_error).length;
            if (recentFails >= 5) {
              await base44.asServiceRole.entities.SendingAccount.update(account.id, {
                health_status: 'risky', paused_reason: 'Auto-paused: repeated send failures',
              });
            }
          }
        }

        // Audit every send attempt
        await base44.asServiceRole.entities.AuditLog.create({
          action: sendResult.success ? 'send_executed' : 'send_failed',
          entity_type: 'ScheduledOutreach', entity_id: job.id,
          channel: job.channel, result: sendResult.success ? 'success' : 'failed',
          metadata: JSON.stringify({ draft_id: job.draft_id, company_id: job.company_id, error: sendResult.error }),
        });
      }

      return Response.json({ success: true, results });
    }

    // ── INGEST WEBHOOK ────────────────────────────────────────────────────────
    if (action === 'webhook') {
      const { provider, event_type, message_id, email, status, error_code } = body;
      return await handleWebhook(base44, { provider, event_type, message_id, email, status, error_code });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── EMAIL SEND ─────────────────────────────────────────────────────────────────
async function sendEmailJob(base44, job, draft, account, testMode = true) {
  try {
    const company = await base44.asServiceRole.entities.Company.get(job.company_id);
    if (!company?.primary_email) return { success: false, error: 'No recipient email' };

    if (testMode) {
      // TEST MODE — do not actually send. Log a simulated send.
      await base44.asServiceRole.entities.OutreachDraft.update(draft.id, { status: 'sent', sent_at: new Date().toISOString() });
      await base44.asServiceRole.entities.OutreachLog.create({
        company_id: job.company_id, company_name: company.company_name,
        channel: 'email', action: draft.draft_type || 'email_send', status: 'test_send',
        notes: `TEST MODE — Simulated send to ${company.primary_email}. Subject: ${draft.subject || ''}`,
        draft_id: draft.id,
      });
      await base44.asServiceRole.entities.Company.update(job.company_id, {
        outreach_status: 'contacted', last_contacted_at: new Date().toISOString(),
      });
      return { success: true, simulated: true };
    }

    // LIVE MODE — actually send via Base44 SendEmail integration
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: company.primary_email,
      subject: draft.subject || 'Following up',
      body: draft.body || '',
      from_name: account?.account_name || 'RFXAI OutreachOS',
    });

    await base44.asServiceRole.entities.OutreachDraft.update(draft.id, { status: 'sent', sent_at: new Date().toISOString() });
    await base44.asServiceRole.entities.OutreachLog.create({
      company_id: job.company_id, company_name: company.company_name,
      channel: 'email', action: draft.draft_type || 'email_send', status: 'sent', draft_id: draft.id,
    });
    await base44.asServiceRole.entities.Company.update(job.company_id, {
      outreach_status: 'contacted', last_contacted_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── LINKEDIN TASK (manual-assist only) ────────────────────────────────────────
async function createLinkedInTask(base44, job, draft) {
  try {
    await base44.asServiceRole.entities.Task.create({
      company_id: job.company_id, company_name: job.company_name,
      task_type: 'linkedin_follow_up', title: `LinkedIn: ${draft.draft_type?.replace(/_/g,' ')} — ${job.company_name}`,
      notes: draft.body?.substring(0, 500),
      status: 'pending',
    });
    // Log blocked auto-attempt
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'linkedin_auto_send_blocked', entity_type: 'ScheduledOutreach', entity_id: job.id,
      channel: 'linkedin', result: 'blocked',
      metadata: JSON.stringify({ reason: 'LinkedIn auto-send is not permitted. Manual task created.', company_id: job.company_id }),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── CALL TASK ─────────────────────────────────────────────────────────────────
async function createCallTask(base44, job, draft) {
  try {
    await base44.asServiceRole.entities.Task.create({
      company_id: job.company_id, company_name: job.company_name,
      task_type: 'call_reminder', title: `Call: ${job.company_name}`,
      notes: draft.body?.substring(0, 300), status: 'pending',
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── WEBHOOK HANDLER ───────────────────────────────────────────────────────────
async function handleWebhook(base44, { provider, event_type, message_id, email, status, error_code }) {
  // Map webhook event to outreach log status
  const statusMap = {
    delivered: 'delivered', opened: 'opened', clicked: 'clicked',
    replied: 'replied', bounced: 'bounced', complained: 'complained',
    unsubscribed: 'not_interested', failed: 'failed',
    sent: 'sent', opted_out: 'not_interested',
    answered: 'answered', voicemail: 'no_answer', completed: 'completed',
  };

  const mappedStatus = statusMap[event_type] || event_type;

  // Find scheduled outreach by provider message ID
  if (message_id) {
    const jobs = await base44.asServiceRole.entities.ScheduledOutreach.filter({ provider_message_id: message_id });
    for (const job of jobs) {
      await base44.asServiceRole.entities.OutreachLog.create({
        company_id: job.company_id, company_name: job.company_name,
        channel: job.channel, action: 'webhook_' + event_type, status: mappedStatus,
        notes: error_code ? `Provider error: ${error_code}` : null,
        draft_id: job.draft_id,
      });

      // Handle bounce/complaint — add to suppression and check thresholds
      if (event_type === 'bounced' && email) {
        const existing = await base44.asServiceRole.entities.SuppressionList.filter({ value: email });
        if (!existing.length) {
          await base44.asServiceRole.entities.SuppressionList.create({
            channel: 'email', value: email, value_type: 'email',
            reason: 'bounced', source: 'webhook_' + provider,
          });
        }
        // Check if account should be paused
        if (job.sending_account_id) {
          const account = await base44.asServiceRole.entities.SendingAccount.get(job.sending_account_id);
          if (account) {
            const newBounceRate = (account.bounce_rate || 0) + 0.5;
            if (newBounceRate > 5) {
              await base44.asServiceRole.entities.SendingAccount.update(account.id, {
                health_status: 'paused', bounce_rate: newBounceRate,
                paused_reason: 'Auto-paused: bounce rate exceeded 5%',
              });
            } else {
              await base44.asServiceRole.entities.SendingAccount.update(account.id, { bounce_rate: newBounceRate });
            }
          }
        }
      }

      if (event_type === 'unsubscribed' && email) {
        const existing = await base44.asServiceRole.entities.SuppressionList.filter({ value: email });
        if (!existing.length) {
          await base44.asServiceRole.entities.SuppressionList.create({
            channel: 'email', value: email, value_type: 'email',
            reason: 'unsubscribed', source: 'webhook_' + provider,
          });
        }
      }
    }
  }

  return Response.json({ success: true, event_type, mapped_status: mappedStatus });
}