import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Ban, Plus, Trash2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const REASON_COLORS = {
  unsubscribed: 'bg-amber-100 text-amber-700',
  bounced: 'bg-red-100 text-red-700',
  complained: 'bg-red-200 text-red-800',
  opted_out: 'bg-orange-100 text-orange-600',
  do_not_contact: 'bg-red-100 text-red-700',
  competitor: 'bg-purple-100 text-purple-700',
  manual: 'bg-gray-100 text-gray-600',
};

export default function SuppressionListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ channel: 'email', value: '', value_type: 'email', reason: 'manual', notes: '' });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['suppression-list'],
    queryFn: () => base44.entities.SuppressionList.list('-created_date', 5000),
  });

  const filtered = items.filter(item => {
    if (channelFilter !== 'all' && item.channel !== channelFilter) return false;
    if (search && !item.value?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleAdd = async () => {
    if (!form.value) return;
    await base44.functions.invoke('complianceEngine', { action: 'add_suppression', ...form });
    qc.invalidateQueries({ queryKey: ['suppression-list'] });
    toast.success('Added to suppression list');
    setShowAdd(false);
    setForm({ channel: 'email', value: '', value_type: 'email', reason: 'manual', notes: '' });
  };

  const handleDelete = async (id) => {
    await base44.functions.invoke('complianceEngine', { action: 'remove_suppression', suppression_id: id });
    qc.invalidateQueries({ queryKey: ['suppression-list'] });
    toast.success('Removed from suppression list');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Suppression List</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} suppressed contacts across all channels</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Entry
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search email, domain, phone..." className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {['email', 'linkedin', 'sms', 'phone', 'all'].map(c => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ban className="w-8 h-8 mx-auto mb-2 opacity-20" />
              {search ? 'No matches found' : 'Suppression list is empty'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border">
                <tr>
                  {['Value', 'Type', 'Channel', 'Reason', 'Source', 'Added By', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-mono">{item.value}</td>
                    <td className="px-3 py-2.5 capitalize text-muted-foreground">{item.value_type}</td>
                    <td className="px-3 py-2.5 capitalize">{item.channel}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={cn('text-[10px]', REASON_COLORS[item.reason] || 'bg-gray-100 text-gray-600')}>
                        {item.reason?.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{item.source || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{item.added_by || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{item.created_date ? format(new Date(item.created_date), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-3 py-2.5">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add to Suppression List</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['email','linkedin','sms','phone','all'].map(c => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Value Type</Label>
                <Select value={form.value_type} onValueChange={v => setForm(f => ({ ...f, value_type: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{['email','domain','phone','linkedin_url','company_id'].map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Value *</Label>
              <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. user@domain.com" />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{['unsubscribed','bounced','complained','opted_out','do_not_contact','competitor','manual'].map(r => <SelectItem key={r} value={r} className="text-xs">{r.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={!form.value}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}