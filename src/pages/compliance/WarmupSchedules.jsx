import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Thermometer, Plus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const DEFAULT_FORM = {
  schedule_name: '', day_1_limit: 25, day_2_limit: 35, day_3_limit: 50,
  day_4_limit: 70, day_5_limit: 90, day_6_limit: 120, day_7_limit: 150,
  max_bounce_rate_pct: 3, max_complaint_rate_pct: 0.1, is_active: true,
};

export default function WarmupSchedules() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['warmup-schedules'],
    queryFn: () => base44.entities.WarmupSchedule.list('-created_date', 50),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['sending-accounts'],
    queryFn: () => base44.entities.SendingAccount.list('-created_date', 100),
  });

  const handleSave = async () => {
    if (!form.schedule_name) return;
    if (editing?.id) {
      await base44.entities.WarmupSchedule.update(editing.id, form);
    } else {
      await base44.entities.WarmupSchedule.create(form);
    }
    qc.invalidateQueries({ queryKey: ['warmup-schedules'] });
    toast.success('Warmup schedule saved');
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.WarmupSchedule.delete(id);
    qc.invalidateQueries({ queryKey: ['warmup-schedules'] });
  };

  const openEdit = (s) => { setEditing(s); setForm(s); setShowModal(true); };
  const openNew = () => { setEditing(null); setForm(DEFAULT_FORM); setShowModal(true); };

  const getAccountName = (id) => accounts.find(a => a.id === id)?.account_name || 'All accounts';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Warmup Schedules</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Configure gradual volume ramp-up for new sending accounts</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" /> New Schedule
        </Button>
      </div>

      <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>How warmup works:</strong> New email accounts start at a low send volume and gradually increase each day. The system
        automatically pauses warmup if bounce or complaint rates exceed thresholds. Volume only increases when account health is good.
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Thermometer className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">No warmup schedules</p>
            <p className="text-sm text-muted-foreground/70 mb-3">Create a default warmup schedule to protect new sending accounts</p>
            <Button size="sm" onClick={openNew}>Create Schedule</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {schedules.map(s => (
            <Card key={s.id} className="border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{s.schedule_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{getAccountName(s.sending_account_id)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openEdit(s)}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="flex gap-2 mt-1">
                  {[1,2,3,4,5,6,7].map(day => {
                    const limit = s[`day_${day}_limit`] || 0;
                    const maxVal = s.day_7_limit || 150;
                    const pct = Math.round((limit / maxVal) * 100);
                    return (
                      <div key={day} className="flex-1 text-center">
                        <div className="relative h-16 flex items-end justify-center mb-1">
                          <div className="w-full bg-primary/20 rounded-sm" style={{ height: `${pct}%`, minHeight: '4px' }} />
                        </div>
                        <p className="text-[10px] font-bold">{limit}</p>
                        <p className="text-[9px] text-muted-foreground">D{day}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Max bounce: {s.max_bounce_rate_pct}%</span>
                  <span>Max complaint: {s.max_complaint_rate_pct}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Warmup Schedule</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Schedule Name *</Label>
              <Input value={form.schedule_name} onChange={e => setForm(f => ({ ...f, schedule_name: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Linked Account (optional)</Label>
              <Select value={form.sending_account_id || 'none'} onValueChange={v => setForm(f => ({ ...f, sending_account_id: v === 'none' ? null : v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">All accounts (default)</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Daily Send Limits (Days 1–7)</Label>
              <div className="grid grid-cols-7 gap-1.5 mt-1">
                {[1,2,3,4,5,6,7].map(day => (
                  <div key={day}>
                    <p className="text-[10px] text-muted-foreground text-center mb-1">D{day}</p>
                    <Input type="number" min="1" value={form[`day_${day}_limit`] || ''} onChange={e => setForm(f => ({ ...f, [`day_${day}_limit`]: Number(e.target.value) }))} className="h-8 text-xs text-center p-1" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Max Bounce Rate (%)</Label>
                <Input type="number" step="0.1" value={form.max_bounce_rate_pct} onChange={e => setForm(f => ({ ...f, max_bounce_rate_pct: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Max Complaint Rate (%)</Label>
                <Input type="number" step="0.01" value={form.max_complaint_rate_pct} onChange={e => setForm(f => ({ ...f, max_complaint_rate_pct: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.schedule_name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}