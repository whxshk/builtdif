import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_id, channel, action, status, notes, draft_id } = await req.json();
    if (!company_id || !channel || !action || !status) {
      return Response.json({ error: 'company_id, channel, action, status are required' }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.get(company_id);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const log = await base44.asServiceRole.entities.OutreachLog.create({
      company_id,
      company_name: company.company_name,
      channel,
      action,
      status,
      notes: notes || null,
      draft_id: draft_id || null,
    });

    // Update company outreach status
    const companyUpdates = { last_contacted_at: new Date().toISOString() };
    if (['sent', 'completed', 'copied'].includes(status)) {
      companyUpdates.outreach_status = 'contacted';
    } else if (status === 'interested') {
      companyUpdates.outreach_status = 'qualified';
    } else if (status === 'not_interested') {
      companyUpdates.outreach_status = 'not_interested';
    }

    // Mark draft as sent if applicable
    if (draft_id && ['sent', 'completed', 'copied'].includes(status)) {
      await base44.asServiceRole.entities.OutreachDraft.update(draft_id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
    }

    await base44.asServiceRole.entities.Company.update(company_id, companyUpdates);

    return Response.json({ success: true, log });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});