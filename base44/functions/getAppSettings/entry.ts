import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Returns the singleton app settings record. Creates one with defaults if none exist.
 * Used by the frontend Settings page and by other backend functions.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await getOrCreateSettings(base44);
    return Response.json({ success: true, settings });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getOrCreateSettings(base44) {
  const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  if (existing.length > 0) return existing[0];
  return await base44.asServiceRole.entities.AppSettings.create({
    key: 'global',
    test_mode: true,
    daily_email_limit: 100,
    delay_between_emails_seconds: 90,
    sending_window_start: '09:00',
    sending_window_end: '17:00',
    avoid_weekends: true,
    sends_today: 0,
  });
}