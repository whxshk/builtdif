import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DEFAULT_FORM = {
  rule_name: '', channel: 'email', provider: 'smtp',
  max_per_minute: 0, max_per_hour: 20, max_per_day: 100,
  max_per_rolling_24h: 100, max_per_week: 500,
  min_delay_seconds: 60, max_delay_seconds: 300,
  warmup_enabled: true, is_active: true,
};

const CHANNEL_COLORS = {
  email: 'bg-blue-100 text-blue-700',
  linkedin: 'bg-sky-100 text-sky-700',
  sms: 'bg-green-100 text-green-700',
  phone: 'bg-purple-100 text-purple-700',
};

export default function RateLimits() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rate-limit-rules'],
    queryFn: () => base44.entities.RateLimitRule.list('-created_date', 200),
  });

  const handleSave = async () => {
    if (!form.rule_name) return;
    if (editing?.id) {
      await base44.entities.RateLimitRule.update(editing.id, form);
    } else {
      await base44.entities.RateLimitRule.create(form);
    }
    qc.invalidateQueries({ queryKey: ['rate-limit-rules'] });
    toast.success('Rule saved');
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.RateLimitRule.delete(id);
    qc.invalidateQueries({ queryKey: ['rate-limit-rules'] });
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm(rule);
    setShowModal(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Rate Limit Rules</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Per-channel throttling limits and delay settings</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">No rate limit rules</p>
            <p className="text-sm text-muted-foreground/70 mb-3">Add rules to control how fast outreach is sent per channel</p>
            <Button size="sm" onClick={openNew}>Add Rule</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} className={cn('border-border/60', !rule.is_active && 'opacity-60')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className={cn('text-xs capitalize', CHANNEL_COLORS[rule.channel])}>{rule.channel}</Badge>
                    <div>
                      <p className="font-semibold text-sm">{rule.rule_name}</p>
                      <p className="text-xs text-muted-foreground">{rule.provider}</p>
                    </div>
                    {!rule.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openEdit(rule)}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-3 mt-3">
                  {[
                    { label: '/min', value: rule.max_per_minute || '—' },
                    { label: '/hr', value: rule.max_per_hour || '—' },
                    { label: '/day', value: rule.max_per_day || '—' },
                    { label: '/24h rolling', value: rule.max_per_rolling_24h || '—' },
                    { label: '/week', value: rule.max_per_week || '—' },
                    { label: 'Min delay (s)', value: rule.min_delay_seconds || 60 },
                    { label: 'Max delay (s)', value: rule.max_delay_seconds || 300 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {rule.warmup_enabled && <span className="text-green-600">✓ Warmup enabled</span>}
                  {rule.requires_opt_in && <span className="text-amber-600">⚠ Requires opt-in</span>}
                  {rule.requires_consent_check && <span className="text-amber-600">⚠ Requires consent check</span>}
                  {rule.auto_send_allowed === false && <span className="text-red-600">✗ Auto-send not allowed</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Rate Limit Rule</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Rule Name *</Label>
                <Input value={form.rule_name} onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['email','linkedin','sms','phone'].map(c => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Provider</Label>
              <Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'max_per_minute', label: 'Max/Minute' },
                { key: 'max_per_hour', label: 'Max/Hour' },
                { key: 'max_per_day', label: 'Max/Day' },
                { key: 'max_per_rolling_24h', label: 'Max Rolling 24h' },
                { key: 'max_per_week', label: 'Max/Week' },
                { key: 'min_delay_seconds', label: 'Min Delay (s)' },
                { key: 'max_delay_seconds', label: 'Max Delay (s)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" min="0" value={form[key] || 0} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
                </div>
              ))}
            </div>
            <div className="flex gap-6">
              {[
                { key: 'warmup_enabled', label: 'Warmup Enabled' },
                { key: 'is_active', label: 'Active' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Switch checked={form[key]} onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))} />
                  <Label className="text-xs">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.rule_name}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}