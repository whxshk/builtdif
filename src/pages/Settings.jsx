import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Save } from 'lucide-react';

const DEFAULTS = {
  test_mode: true,
  daily_email_limit: 50,
  sending_window_start: '09:00',
  sending_window_end: '17:00',
};

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await base44.functions.invoke('appSettings', { action: 'get' });
      if (res.data?.settings) {
        setSettings({ ...DEFAULTS, ...res.data.settings });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('appSettings', { action: 'update', settings });
      toast.success('Settings saved');
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outreach Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Test Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Simulate sends without actually sending emails</p>
            </div>
            <Switch
              checked={!!settings.test_mode}
              onCheckedChange={(v) => setSettings(s => ({ ...s, test_mode: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Daily Email Limit</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={settings.daily_email_limit}
              onChange={(e) => setSettings(s => ({ ...s, daily_email_limit: parseInt(e.target.value) || 50 }))}
              className="w-40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Sending Window Start</Label>
              <Input
                type="time"
                value={settings.sending_window_start}
                onChange={(e) => setSettings(s => ({ ...s, sending_window_start: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sending Window End</Label>
              <Input
                type="time"
                value={settings.sending_window_end}
                onChange={(e) => setSettings(s => ({ ...s, sending_window_end: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}