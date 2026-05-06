import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function LinkedInSafety() {
  const qc = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState(null);

  const { data: configs = [] } = useQuery({
    queryKey: ['linkedin-compliance'],
    queryFn: () => base44.entities.LinkedInCompliance.list('-created_date', 10),
  });

  const { data: pendingTasks = [] } = useQuery({
    queryKey: ['linkedin-pending-tasks'],
    queryFn: () => base44.entities.Task.filter({ task_type: 'linkedin_follow_up', status: 'pending' }),
  });

  const { data: completedTasks = [] } = useQuery({
    queryKey: ['linkedin-completed-tasks'],
    queryFn: () => base44.entities.Task.filter({ task_type: 'linkedin_follow_up', status: 'completed' }),
  });

  const { data: auditBlocked = [] } = useQuery({
    queryKey: ['linkedin-blocked-audit'],
    queryFn: () => base44.entities.AuditLog.filter({ action: 'linkedin_auto_send_blocked' }),
  });

  const config = configs[0];

  const handleSave = async () => {
    if (!form) return;
    if (config?.id) {
      await base44.entities.LinkedInCompliance.update(config.id, form);
    } else {
      await base44.entities.LinkedInCompliance.create({ ...form, auto_send_enabled: false, mode: 'manual_assist' });
    }
    qc.invalidateQueries({ queryKey: ['linkedin-compliance'] });
    toast.success('LinkedIn settings saved');
    setShowSettings(false);
  };

  const openSettings = () => {
    setForm(config || {
      daily_manual_task_limit: 20,
      weekly_manual_task_limit: 80,
      task_spacing_minutes: 30,
      auto_send_enabled: false,
      mode: 'manual_assist',
      health_status: 'healthy',
    });
    setShowSettings(true);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">LinkedIn Safety Center</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manual-assist mode only. Auto-send is strictly prohibited.</p>
        </div>
        <Button size="sm" variant="outline" onClick={openSettings} className="gap-1.5 h-8 text-xs">
          <Settings className="w-3.5 h-3.5" /> Settings
        </Button>
      </div>

      {/* Safety Banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">LinkedIn Auto-Send is NOT Permitted</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Unauthorized LinkedIn automation (browser bots, scraping, auto-clicking, session automation) violates LinkedIn's Terms of Service
            and risks permanent account restriction. This platform uses <strong>manual-assist mode only</strong> — tasks are created for
            you to complete manually inside LinkedIn.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Daily Task Limit',    value: config?.daily_manual_task_limit || 20,    color: 'text-blue-600' },
          { label: 'Weekly Task Limit',   value: config?.weekly_manual_task_limit || 80,   color: 'text-blue-600' },
          { label: 'Pending Tasks',       value: pendingTasks.length,                       color: 'text-amber-600' },
          { label: 'Completed Tasks',     value: completedTasks.length,                     color: 'text-green-600' },
          { label: 'Blocked Auto-Sends',  value: auditBlocked.length,                       color: 'text-red-600' },
          { label: 'Task Spacing (min)',  value: config?.task_spacing_minutes || 30,        color: 'text-gray-600' },
          { label: 'Official API',        value: config?.official_api_connected ? 'Connected' : 'Not Connected', color: config?.official_api_connected ? 'text-green-600' : 'text-gray-500' },
          { label: 'Mode',               value: config?.mode || 'manual_assist',            color: 'text-gray-700' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compliance Rules */}
      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-sm">LinkedIn Compliance Rules</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-2">
          {[
            { ok: true,  text: 'Auto-send is disabled (manual-assist mode active)' },
            { ok: true,  text: 'Connection request messages are generated for manual copy-paste' },
            { ok: true,  text: 'LinkedIn tasks are throttled to daily and weekly limits' },
            { ok: true,  text: 'Tasks are spaced by minimum interval' },
            { ok: true,  text: 'All LinkedIn activity is logged in company timeline' },
            { ok: false, text: 'No browser automation, scraping, or cookie/session injection' },
            { ok: false, text: 'No fake accounts or proxy rotation' },
            { ok: false, text: 'No bulk auto-send of connection requests or messages' },
          ].map(({ ok, text }, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              {ok
                ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              <span className={ok ? 'text-foreground' : 'text-muted-foreground line-through'}>{text}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending LinkedIn Tasks */}
      {pendingTasks.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Pending Manual LinkedIn Tasks ({pendingTasks.length})</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            {pendingTasks.slice(0, 10).map(task => (
              <div key={task.id} className="flex items-center justify-between px-3 py-2 bg-muted/20 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.company_name}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                  await base44.entities.Task.update(task.id, { status: 'completed' });
                  qc.invalidateQueries();
                  toast.success('Marked as done');
                }}>Mark Done</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>LinkedIn Safety Settings</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 py-2">
              {[
                { key: 'daily_manual_task_limit', label: 'Daily Task Limit' },
                { key: 'weekly_manual_task_limit', label: 'Weekly Task Limit' },
                { key: 'task_spacing_minutes', label: 'Min. Spacing Between Tasks (min)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" min="1" value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
                </div>
              ))}
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-red-800">Auto-Send</p>
                    <p className="text-[10px] text-red-600">Always disabled in manual-assist mode</p>
                  </div>
                  <Switch checked={false} disabled />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}