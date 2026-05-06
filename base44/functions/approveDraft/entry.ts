import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { draft_id, action, updated_body, updated_subject } = await req.json();
    if (!draft_id) return Response.json({ error: 'draft_id is required' }, { status: 400 });

    const draft = await base44.asServiceRole.entities.OutreachDraft.get(draft_id);
    if (!draft) return Response.json({ error: 'Draft not found' }, { status: 404 });

    const updates = {};

    if (action === 'approve') {
      updates.status = 'approved';
      updates.approved_at = new Date().toISOString();
    } else if (action === 'skip') {
      updates.status = 'skipped';
    } else if (action === 'edit') {
      if (updated_body !== undefined) updates.body = updated_body;
      if (updated_subject !== undefined) updates.subject = updated_subject;
    } else if (action === 'unapprove') {
      updates.status = 'draft';
      updates.approved_at = null;
    }

    const updated = await base44.asServiceRole.entities.OutreachDraft.update(draft_id, updates);
    return Response.json({ success: true, draft: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});