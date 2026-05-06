import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Single-draft send. Honors AppSettings.test_mode by default
 * unless caller explicitly passes test_mode in body.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { draft_id } = body;
    if (!draft_id) return Response.json({ error: 'draft_id is required' }, { status: 400 });

    const draft = await base44.asServiceRole.entities.OutreachDraft.get(draft_id);
    if (!draft) return Response.json({ error: 'Draft not found' }, { status: 404 });
    if (draft.channel !== 'email') return Response.json({ error: 'Not an email draft' }, { status: 400 });
    if (draft.status === 'sent') return Response.json({ error: 'Already sent' }, { status: 400 });
    if (draft.status !== 'approved') return Response.json({ error: 'Draft must be approved before sending' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(draft.company_id);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });
    if (!company.primary_email) return Response.json({ error: 'Company has no primary email' }, { status: 400 });

    // Resolve test mode: explicit caller flag wins, else AppSettings
    let testMode = body.test_mode;
    if (testMode === undefined) {
      const settings = await getSettings(base44);
      testMode = settings.test_mode !== false;
    }

    if (testMode) {
      await base44.asServiceRole.entities.OutreachDraft.update(draft_id, {
        status: 'sent', sent_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.OutreachLog.create({
        company_id: company.id, company_name: company.company_name,
        channel: 'email', action: 'simulated_send', status: 'test_send',
        notes: `TEST MODE — Email to ${company.primary_email} not actually sent. Subject: ${draft.subject}`,
        draft_id,
      });
      await base44.asServiceRole.entities.Company.update(company.id, {
        outreach_status: 'contacted', last_contacted_at: new Date().toISOString(),
      });
      return Response.json({ success: true, mode: 'test', message: 'Email simulated (not actually sent)' });
    }

    // Real send
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: company.primary_email,
      subject: draft.subject || '(No subject)',
      body: draft.body,
    });
    await base44.asServiceRole.entities.OutreachDraft.update(draft_id, {
      status: 'sent', sent_at: new Date().toISOString(),
    });
    await base44.asServiceRole.entities.OutreachLog.create({
      company_id: company.id, company_name: company.company_name,
      channel: 'email', action: 'email_sent', status: 'sent',
      notes: `Email sent to ${company.primary_email}. Subject: ${draft.subject}`,
      draft_id,
    });
    await base44.asServiceRole.entities.Company.update(company.id, {
      outreach_status: 'contacted', last_contacted_at: new Date().toISOString(),
    });

    return Response.json({ success: true, mode: 'real', message: 'Email sent' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getSettings(base44) {
  const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  if (existing.length > 0) return existing[0];
  return await base44.asServiceRole.entities.AppSettings.create({
    key: 'global', test_mode: true, daily_email_limit: 100,
    delay_between_emails_seconds: 90, sending_window_start: '09:00',
    sending_window_end: '17:00', avoid_weekends: true, sends_today: 0,
  });
}