import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULTS = {
  test_mode: true,
  daily_email_limit: 100,
  delay_between_emails_seconds: 90,
  sending_window_start: '09:00',
  sending_window_end: '17:00',
  avoid_weekends: true,
};

async function getAllSettings(base44) {
  const settings = { ...DEFAULTS };
  try {
    const records = await base44.asServiceRole.entities.AppSetting.list('-created_date', 100);
    for (const r of records) {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch {
        settings[r.key] = r.value;
      }
    }
  } catch (_) {
    // Entity may not yet be available — return defaults
  }
  return settings;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action = 'get' } = body;

    if (action === 'get') {
      const settings = await getAllSettings(base44);
      return Response.json({ success: true, settings });
    }

    if (action === 'set') {
      const { key, value } = body;
      if (!key) return Response.json({ error: 'key required' }, { status: 400 });
      const valueStr = JSON.stringify(value);
      const existing = await base44.asServiceRole.entities.AppSetting.filter({ key });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value: valueStr });
      } else {
        await base44.asServiceRole.entities.AppSetting.create({ key, value: valueStr });
      }
      const settings = await getAllSettings(base44);
      return Response.json({ success: true, settings });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});