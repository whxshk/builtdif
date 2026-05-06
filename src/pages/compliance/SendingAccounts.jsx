import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Pause, Play, Trash2, Mail, Linkedin, Phone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, sms: MessageSquare, phone: Phone };
const HEALTH_COLORS = {
  healthy: 'bg-green-100 text-green-700',
  warming_up: 'bg-amber-100 text-amber-700',
  limited: 'bg-orange-100 text-orange-600',
  paused: 'bg-red-100 text-red-600',
  risky: 'bg-red-100 text-red-700',
  blocked: 'bg-red-200 text-red-800',
  disconnected: 'bg-gray-100 text-gray-500',
};

const DEFAULT_FORM = {
  account_name: '', channel: 'email', provider: 'smtp', email_address: '',
  phone_number: '', linkedin_profile_url: '', daily_limit: 100,
  hourly_limit: 20, rolling_24h_limit: 100, is_active: true,
};

function AccountModal({ open, onClose, account, onSaved }) {
  const [form, setForm] = useState(account || DEFAULT_FORM);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!form.account_name) return;
    setLoading(true);
    if (account?.id) {
      await base44.entities.SendingAccount.update(account.id, form);
    } else {
      await base44.entities.SendingAccount.create({ ...form, health_status: 'warming_up', sends_today: 0 });
    }
    toast.success('Account saved');
    onSaved();
    onClose();
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{account ? 'Edit' : 'Add'} Sending Account</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Account Name *</Label>
              <Input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email','linkedin','sms','phone'].map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Provider</Label>
              <Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. gmail, smtp, twilio" />
            </div>
            {form.channel === 'email' && (
              <div>
                <Label className="text-xs">Email Address</Label>
                <Input value={form.email_address} onChange={e => setForm(f => ({ ...f, email_address: e.target.value }))} className="mt-1 h-8 text-sm" type="email" />
              </div>
            )}
            {(form.channel === 'sms' || form.channel === 'phone') && (
              <div>
                <Label className="text-xs">Phone Number</Label>
                <Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
            )}
            {form.channel === 'linkedin' && (
              <div>
                <Label className="text-xs">LinkedIn Profile URL</Label>
                <Input value={form.linkedin_profile_url} onChange={e => setForm(f => ({ ...f, linkedin_profile_url: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'daily_limit', label: 'Daily Limit' },
              { key: 'hourly_limit', label: 'Hourly Limit' },
              { key: 'rolling_24h_limit', label: 'Rolling 24h' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <Input type="number" min="1" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} className="mt-1 h-8 text-sm" />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={loading || !form.account_name}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SendingAccounts() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['sending-accounts'],
    queryFn: () => base44.entities.SendingAccount.list('-created_date', 200),
  });

  const handleToggle = async (acc) => {
    const newActive = !acc.is_active;
    await base44.entities.SendingAccount.update(acc.id, {
      is_active: newActive,
      health_status: newActive ? 'warming_up' : 'paused',
      paused_reason: newActive ? null : 'Manually paused',
    });
    qc.invalidateQueries({ queryKey: ['sending-accounts'] });
    toast.success(newActive ? 'Account activated' : 'Account paused');
  };

  const handleDelete = async (id) => {
    await base44.entities.SendingAccount.delete(id);
    qc.invalidateQueries({ queryKey: ['sending-accounts'] });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Sending Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage email, LinkedIn, SMS, and phone sending identities</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-12 text-center">
            <Mail className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">No sending accounts</p>
            <p className="text-sm text-muted-foreground/70 mb-3">Add email, LinkedIn, or phone accounts to start sending</p>
            <Button size="sm" onClick={() => setShowModal(true)}>Add Account</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(acc => {
            const Icon = CHANNEL_ICONS[acc.channel] || Mail;
            const usedPct = acc.daily_limit > 0 ? Math.round(((acc.sends_today || 0) / acc.daily_limit) * 100) : 0;
            return (
              <Card key={acc.id} className={cn('border-border/60', !acc.is_active && 'opacity-60')}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{acc.account_name}</p>
                        <Badge className={cn('text-[10px]', HEALTH_COLORS[acc.health_status] || 'bg-gray-100 text-gray-600')}>
                          {acc.health_status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{acc.channel} · {acc.provider || 'Unknown provider'}</p>
                      {acc.email_address && <p className="text-xs text-muted-foreground">{acc.email_address}</p>}
                      {acc.phone_number && <p className="text-xs text-muted-foreground">{acc.phone_number}</p>}

                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Daily usage</span>
                          <span className="font-medium">{acc.sends_today || 0} / {acc.daily_limit || 100}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-green-500')}
                               style={{ width: `${Math.min(usedPct, 100)}%` }} />
                        </div>
                        <div className="flex gap-4 text-[10px] text-muted-foreground pt-0.5">
                          <span>Bounce: {acc.bounce_rate?.toFixed(1) || '0.0'}%</span>
                          <span>Complaint: {acc.complaint_rate?.toFixed(2) || '0.00'}%</span>
                          <span>Warmup day {acc.warmup_day || 1}</span>
                        </div>
                      </div>

                      {acc.paused_reason && (
                        <p className="text-[10px] text-red-600 mt-1.5 bg-red-50 px-2 py-1 rounded">{acc.paused_reason}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1.5 mt-3 pt-3 border-t border-border/30">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setEditing(acc); setShowModal(true); }}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className={cn('h-7 text-xs gap-1', acc.is_active ? 'text-amber-600' : 'text-green-600')} onClick={() => handleToggle(acc)}>
                      {acc.is_active ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Resume</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-500 ml-auto" onClick={() => handleDelete(acc.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AccountModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        account={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ['sending-accounts'] })}
      />
    </div>
  );
}