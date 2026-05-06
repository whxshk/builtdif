import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const updates = await req.json();
    delete updates.key;
    delete updates.id;

    let existing = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    let record;
    if (existing.length > 0) {
      record = await base44.asServiceRole.entities.AppSettings.update(existing[0].id, updates);
    } else {
      record = await base44.asServiceRole.entities.AppSettings.create({ key: 'global', ...updates });
    }

    return Response.json({ success: true, settings: record });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});