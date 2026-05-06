import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Compliance Engine — checks whether a given outreach action is allowed.
 * Also handles: schedule-bulk, pause/resume campaign, emergency-stop, suppression CRUD.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── CHECK COMPLIANCE ─────────────────────────────────────────────────────
    if (action === 'check') {
      const { channel, company_id, contact_id, sending_account_id, draft_id, project_id } = body;
      const result = await checkCompliance(base44, { channel, company_id, contact_id, sending_account_id, draft_id, project_id });
      return Response.json(result);
    }

    // ── SCHEDULE BULK CAMPAIGN ───────────────────────────────────────────────
    if (action === 'schedule_bulk') {
      const { project_id, draft_ids, channel = 'email', sending_account_ids = [] } = body;

      // Load app settings (test_mode, daily limits, throttle, sending window)
      const settings = {
        test_mode: true,
        daily_email_limit: 100,
        delay_between_emails_seconds: 90,
        sending_window_start: '09:00',
        sending_window_end: '17:00',
        avoid_weekends: true,
      };
      try {
        const settingsRecords = await base44.asServiceRole.entities.AppSetting.list('-created_date', 100);
        for (const r of settingsRecords) {
          try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
        }
      } catch (_) { /* defaults */ }
      const testMode = settings.test_mode !== false;
      const dailyLimit = Number(settings.daily_email_limit) || 100;
      const delaySec = Number(settings.delay_between_emails_seconds) || 90;

      // Load all drafts that are approved for this project/channel
      let drafts = draft_ids
        ? await Promise.all(draft_ids.map(id => base44.asServiceRole.entities.OutreachDraft.get(id)))
        : await base44.asServiceRole.entities.OutreachDraft.filter({ status: 'approved', channel });

      drafts = drafts.filter(Boolean);

      // Load sending accounts (optional in test mode)
      let accounts = sending_account_ids.length > 0
        ? await Promise.all(sending_account_ids.map(id => base44.asServiceRole.entities.SendingAccount.get(id)))
        : await base44.asServiceRole.entities.SendingAccount.filter({ channel, is_active: true });

      accounts = accounts.filter(a => a && a.health_status !== 'blocked' && a.health_status !== 'disconnected' && a.is_active);

      if (!accounts.length && !testMode) {
        return Response.json({ error: 'No active sending accounts available for this channel. Add a sending account in Settings or enable Test Mode.' }, { status: 400 });
      }

      // Load suppression list
      const suppressions = await base44.asServiceRole.entities.SuppressionList.list('-created_date', 5000);
      const suppressedEmails = new Set(suppressions.filter(s => s.channel === 'email' || s.channel === 'all').map(s => s.value.toLowerCase()));
      const suppressedDomains = new Set(suppressions.filter(s => s.value_type === 'domain').map(s => s.value.toLowerCase()));
      const suppressedCompanies = new Set(suppressions.filter(s => s.value_type === 'company_id').map(s => s.value));

      // Load sending window for project; otherwise build one from app settings
      const windows = project_id
        ? await base44.asServiceRole.entities.CampaignSendingWindow.filter({ project_id, is_active: true })
        : [];
      const window = windows[0] || {
        start_time: settings.sending_window_start,
        end_time: settings.sending_window_end,
        send_monday: true, send_tuesday: true, send_wednesday: true, send_thursday: true,
        send_friday: !settings.avoid_weekends, send_saturday: !settings.avoid_weekends, send_sunday: !settings.avoid_weekends,
      };

      const results = { total: drafts.length, scheduled: 0, compliance_blocked: 0, missing_email: 0, suppressed: 0, jobs: [], test_mode: testMode };
      const now = new Date();
      let slotTime = getNextSendSlot(now, window);
      let accountIdx = 0;
      let dailyCount = 0;

      for (const draft of drafts) {
        if (!draft) continue;

        // Get company
        const company = await base44.asServiceRole.entities.Company.get(draft.company_id);
        if (!company) continue;

        // Check missing email
        if (channel === 'email' && !company.primary_email) {
          results.missing_email++;
          continue;
        }

        // Check suppression
        const emailLower = (company.primary_email || '').toLowerCase();
        const domain = emailLower.includes('@') ? emailLower.split('@')[1] : '';
        if (suppressedCompanies.has(company.id) || suppressedEmails.has(emailLower) || (domain && suppressedDomains.has(domain))) {
          results.suppressed++;
          continue;
        }

        // Run compliance check (skip account checks in test mode if no account)
        const account = accounts[accountIdx % accounts.length] || null;
        const compliance = await checkCompliance(base44, {
          channel, company_id: company.id, sending_account_id: account?.id, draft_id: draft.id
        });

        if (!compliance.allowed) {
          results.compliance_blocked++;
          await base44.asServiceRole.entities.ScheduledOutreach.create({
            project_id, company_id: company.id, company_name: company.company_name,
            draft_id: draft.id, channel, status: 'compliance_blocked',
            compliance_notes: compliance.reasons.join('; '),
            risk_level: 'blocked',
          });
          continue;
        }

        if (account) accountIdx++;

        // Create scheduled job
        const job = await base44.asServiceRole.entities.ScheduledOutreach.create({
          project_id, company_id: company.id, company_name: company.company_name,
          draft_id: draft.id, channel,
          sending_account_id: account?.id || null,
          scheduled_for: slotTime.toISOString(),
          status: 'scheduled',
          risk_level: compliance.warnings.length > 2 ? 'medium' : 'low',
        });

        results.jobs.push(job.id);
        results.scheduled++;
        dailyCount++;

        // Advance slot: respect daily limit (push to tomorrow 9am if exceeded)
        const delayMs = account ? getDelayMs(account) : (delaySec * 1000 + Math.random() * 30000);
        let next = new Date(slotTime.getTime() + delayMs);
        if (dailyCount >= dailyLimit) {
          next = new Date(slotTime);
          next.setDate(next.getDate() + 1);
          next.setHours(9, 0, 0, 0);
          dailyCount = 0;
        }
        slotTime = getNextSendSlot(next, window);
      }

      // Audit
      await base44.asServiceRole.entities.AuditLog.create({
        user_email: user.email, action: 'schedule_bulk',
        entity_type: 'Campaign', entity_id: project_id || 'bulk',
        channel, result: 'success',
        metadata: JSON.stringify({ scheduled: results.scheduled, blocked: results.compliance_blocked, suppressed: results.suppressed }),
      });

      const lastJob = results.jobs.length > 0 ? results.jobs[results.jobs.length - 1] : null;
      results.estimated_completion = slotTime.toISOString();
      return Response.json({ success: true, results });
    }

    // ── EMERGENCY STOP ───────────────────────────────────────────────────────
    if (action === 'emergency_stop') {
      const { scope = 'all', project_id, sending_account_id, channel } = body;

      if (scope === 'all' || scope === 'scheduled') {
        const scheduled = await base44.asServiceRole.entities.ScheduledOutreach.filter({ status: 'scheduled' });
        for (const job of scheduled) {
          if (channel && job.channel !== channel) continue;
          if (project_id && job.project_id !== project_id) continue;
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { status: 'paused' });
        }
        const queued = await base44.asServiceRole.entities.ScheduledOutreach.filter({ status: 'queued' });
        for (const job of queued) {
          if (channel && job.channel !== channel) continue;
          if (project_id && job.project_id !== project_id) continue;
          await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { status: 'paused' });
        }
      }

      if (sending_account_id) {
        await base44.asServiceRole.entities.SendingAccount.update(sending_account_id, {
          is_active: false, health_status: 'paused', paused_reason: 'Emergency stop by ' + user.email,
        });
      }

      await base44.asServiceRole.entities.AuditLog.create({
        user_email: user.email, action: 'emergency_stop',
        entity_type: 'System', channel: channel || 'all', result: 'success',
        metadata: JSON.stringify({ scope, project_id, sending_account_id }),
      });

      return Response.json({ success: true, message: 'Emergency stop applied' });
    }

    // ── RESUME CAMPAIGN ──────────────────────────────────────────────────────
    if (action === 'resume_campaign') {
      const { project_id } = body;
      const paused = await base44.asServiceRole.entities.ScheduledOutreach.filter({ project_id, status: 'paused' });
      for (const job of paused) {
        await base44.asServiceRole.entities.ScheduledOutreach.update(job.id, { status: 'scheduled' });
      }
      return Response.json({ success: true, resumed: paused.length });
    }

    // ── SUPPRESSION LIST ─────────────────────────────────────────────────────
    if (action === 'add_suppression') {
      const { channel, value, value_type, reason, source } = body;
      const existing = await base44.asServiceRole.entities.SuppressionList.filter({ value });
      if (existing.length > 0) return Response.json({ success: true, existing: true });
      const entry = await base44.asServiceRole.entities.SuppressionList.create({
        channel, value, value_type: value_type || 'email', reason: reason || 'manual',
        source: source || 'manual', added_by: user.email,
      });
      await base44.asServiceRole.entities.AuditLog.create({
        user_email: user.email, action: 'suppression_added', entity_type: 'SuppressionList',
        channel, result: 'success', metadata: JSON.stringify({ value, reason }),
      });
      return Response.json({ success: true, entry });
    }

    if (action === 'remove_suppression') {
      const { suppression_id } = body;
      await base44.asServiceRole.entities.SuppressionList.delete(suppression_id);
      return Response.json({ success: true });
    }

    // ── GET OVERVIEW ─────────────────────────────────────────────────────────
    if (action === 'overview') {
      const [accounts, scheduled, suppressed, auditLogs] = await Promise.all([
        base44.asServiceRole.entities.SendingAccount.list('-created_date', 100),
        base44.asServiceRole.entities.ScheduledOutreach.list('-created_date', 1000),
        base44.asServiceRole.entities.SuppressionList.list('-created_date', 5000),
        base44.asServiceRole.entities.AuditLog.list('-created_date', 100),
      ]);

      return Response.json({
        accounts: {
          total: accounts.length,
          healthy: accounts.filter(a => a.health_status === 'healthy').length,
          paused: accounts.filter(a => a.health_status === 'paused' || !a.is_active).length,
          blocked: accounts.filter(a => a.health_status === 'blocked').length,
        },
        scheduled: {
          total: scheduled.length,
          queued: scheduled.filter(s => s.status === 'queued').length,
          scheduled: scheduled.filter(s => s.status === 'scheduled').length,
          sent: scheduled.filter(s => s.status === 'sent').length,
          failed: scheduled.filter(s => s.status === 'failed').length,
          paused: scheduled.filter(s => s.status === 'paused').length,
          compliance_blocked: scheduled.filter(s => s.status === 'compliance_blocked').length,
        },
        suppression: { total: suppressed.length },
        recent_audit: auditLogs.slice(0, 20),
      });
    }

    // ── SEND PREVIEW ─────────────────────────────────────────────────────────
    if (action === 'send_preview') {
      const { project_id, channel = 'email' } = body;
      const drafts = await base44.asServiceRole.entities.OutreachDraft.filter({ status: 'approved', channel });
      const accounts = await base44.asServiceRole.entities.SendingAccount.filter({ channel, is_active: true });
      const suppressions = await base44.asServiceRole.entities.SuppressionList.list('-created_date', 5000);
      const suppressedVals = new Set(suppressions.map(s => s.value.toLowerCase()));

      let eligible = 0, missing_email = 0, suppressed_count = 0, compliance_blocked = 0;
      const activeAccounts = accounts.filter(a => a.health_status !== 'blocked' && a.health_status !== 'disconnected');
      const totalDailyCapacity = activeAccounts.reduce((s, a) => s + (a.daily_limit || 100), 0);

      for (const draft of drafts) {
        const company = await base44.asServiceRole.entities.Company.get(draft.company_id);
        if (!company) continue;
        if (!company.primary_email) { missing_email++; continue; }
        if (suppressedVals.has(company.primary_email?.toLowerCase())) { suppressed_count++; continue; }
        eligible++;
      }

      const daysToComplete = totalDailyCapacity > 0 ? Math.ceil(eligible / totalDailyCapacity) : 999;
      const riskLevel = eligible > totalDailyCapacity * 3 ? 'high' : eligible > totalDailyCapacity ? 'medium' : 'low';

      return Response.json({
        total_selected: drafts.length,
        eligible,
        missing_email,
        suppressed: suppressed_count,
        compliance_blocked,
        sending_accounts: activeAccounts.length,
        daily_capacity: totalDailyCapacity,
        estimated_days: daysToComplete,
        risk_level: riskLevel,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function checkCompliance(base44, { channel, company_id, contact_id, sending_account_id, draft_id, project_id }) {
  const reasons = [];
  const warnings = [];
  const required_actions = [];

  // Check draft approval
  if (draft_id) {
    const draft = await base44.asServiceRole.entities.OutreachDraft.get(draft_id);
    if (!draft) { reasons.push('Draft not found'); }
    else if (draft.status === 'draft') { reasons.push('Draft not approved'); required_actions.push('approve_draft'); }
    else if (draft.status === 'sent') { reasons.push('Draft already sent'); }
    else if (draft.status === 'skipped') { reasons.push('Draft was skipped'); }
  }

  // Check sending account
  if (sending_account_id) {
    const account = await base44.asServiceRole.entities.SendingAccount.get(sending_account_id);
    if (!account) { reasons.push('Sending account not found'); }
    else {
      if (!account.is_active) reasons.push('Sending account is inactive');
      if (account.health_status === 'blocked') reasons.push('Sending account is blocked');
      if (account.health_status === 'paused') reasons.push('Sending account is paused');
      if (account.health_status === 'disconnected') reasons.push('Sending account is disconnected');
      if (account.sends_today >= account.daily_limit) reasons.push(`Daily send limit reached (${account.daily_limit}/day)`);
      if (account.sends_rolling_24h >= account.rolling_24h_limit) reasons.push('Rolling 24h limit reached');
      if (account.bounce_rate > 5) { reasons.push('High bounce rate — account paused'); }
      else if (account.bounce_rate > 3) warnings.push('Elevated bounce rate');
      if (account.complaint_rate > 0.1) { reasons.push('High complaint rate — account paused'); }
      else if (account.complaint_rate > 0.05) warnings.push('Elevated complaint rate');
    }
  }

  // Check suppression
  if (company_id) {
    const company = await base44.asServiceRole.entities.Company.get(company_id);
    if (company) {
      if (channel === 'email') {
        if (!company.primary_email) { reasons.push('No email address available'); required_actions.push('enrich_contact'); }
        else {
          const emailDomain = company.primary_email.split('@')[1];
          const suppressed = await base44.asServiceRole.entities.SuppressionList.filter({ value: company.primary_email });
          const domainSuppressed = emailDomain ? await base44.asServiceRole.entities.SuppressionList.filter({ value: emailDomain }) : [];
          if (suppressed.length > 0) reasons.push('Email address is suppressed');
          if (domainSuppressed.length > 0) reasons.push('Email domain is suppressed');
        }
      }
      if (channel === 'linkedin') {
        warnings.push('LinkedIn: manual-assist mode only. Auto-send is not permitted.');
        required_actions.push('manual_linkedin_task');
      }
      if (channel === 'sms') {
        const smsComp = contact_id
          ? await base44.asServiceRole.entities.SmsCompliance.filter({ contact_id })
          : [];
        if (!smsComp.length || smsComp[0].opt_in_status !== 'opted_in') {
          reasons.push('SMS opt-in not collected'); required_actions.push('collect_sms_opt_in');
        }
      }
      if (channel === 'phone') {
        const callComp = contact_id
          ? await base44.asServiceRole.entities.CallCompliance.filter({ contact_id })
          : [];
        if (callComp.length > 0 && callComp[0].do_not_call) {
          reasons.push('Number is on Do Not Call list');
        }
      }
    }
  }

  // Email compliance checks
  if (channel === 'email' && sending_account_id) {
    const emailComps = await base44.asServiceRole.entities.EmailCompliance.filter({ sending_account_id });
    if (emailComps.length > 0) {
      const ec = emailComps[0];
      if (!ec.spf_verified) warnings.push('SPF not verified');
      if (!ec.dkim_verified) warnings.push('DKIM not verified');
      if (!ec.dmarc_verified) warnings.push('DMARC not verified');
      if (!ec.unsubscribe_enabled) warnings.push('Unsubscribe link not configured');
      if (ec.bounce_rate > (ec.bounce_threshold || 5)) reasons.push('Bounce rate exceeds threshold');
      if (ec.complaint_rate > (ec.complaint_threshold || 0.1)) reasons.push('Complaint rate exceeds threshold');
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    warnings,
    required_actions,
  };
}

function getDelayMs(account) {
  // Base delay on warmup stage + account type — default 90s between sends per account
  const stage = account?.warmup_stage || 1;
  const base = Math.max(60, 120 - stage * 5); // reduce delay as account warms up
  const jitter = Math.random() * 30;
  return (base + jitter) * 1000;
}

function getNextSendSlot(from, window) {
  if (!window) return from;

  const DAY_MAP = ['send_sunday', 'send_monday', 'send_tuesday', 'send_wednesday', 'send_thursday', 'send_friday', 'send_saturday'];
  const [startH, startM] = (window.start_time || '09:00').split(':').map(Number);
  const [endH, endM] = (window.end_time || '17:00').split(':').map(Number);

  let t = new Date(from);
  let attempts = 0;

  while (attempts < 14) {
    const day = t.getDay();
    const dayField = DAY_MAP[day];
    const hour = t.getHours();
    const minute = t.getMinutes();
    const totalMinutes = hour * 60 + minute;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (window[dayField] && totalMinutes >= startMinutes && totalMinutes < endMinutes) {
      return t;
    }

    // Not in window — advance to next day start
    t.setDate(t.getDate() + 1);
    t.setHours(startH, startM, 0, 0);
    attempts++;
  }

  return from; // fallback
}