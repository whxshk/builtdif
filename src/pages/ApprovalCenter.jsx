import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, RefreshCw, Send, Mail, Linkedin,
  Phone, Loader2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100',
  linkedin: 'text-sky-600 bg-sky-100',
  phone: 'text-purple-600 bg-purple-100',
};

function DraftRow({ draft, selected, onToggle, onApprove, onSkip, onSend, onRegenerate, loading }) {
  const Icon = CHANNEL_ICONS[draft.channel] || Mail;
  return (
    <div className={cn('flex items-start gap-3 p-4 border-b border-border/30 hover:bg-muted/20 transition-colors', draft.status === 'approved' && 'bg-blue-50/30')}>
      <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', CHANNEL_COLORS[draft.channel])}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/companies/${draft.company_id}`} className="text-sm font-semibold hover:text-primary">{draft.company_name}</Link>
          <Badge variant="outline" className="text-xs">{draft.draft_type?.replace(/_/g, ' ')}</Badge>
          <Badge className={cn('text-xs', draft.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>{draft.status}</Badge>
        </div>
        {draft.subject && <p className="text-xs font-medium mt-0.5">{draft.subject}</p>}
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{draft.body?.substring(0, 180)}</p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        {draft.status === 'draft' && (
          <>
            <Button size="sm" onClick={() => onApprove(draft.id)} disabled={loading} className="h-7 text-xs gap-1">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRegenerate(draft)} disabled={loading} className="h-7 text-xs gap-1 text-muted-foreground">
              <RefreshCw className="w-3 h-3" /> Regen
            </Button>
          </>
        )}
        {draft.status === 'approved' && draft.channel === 'email' && (
          <Button size="sm" onClick={() => onSend(draft.id)} disabled={loading} className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
          </Button>
        )}
        {draft.status === 'approved' && draft.channel === 'linkedin' && (
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(draft.body); toast.success('Copied!'); }} className="h-7 text-xs gap-1 text-sky-600 border-sky-300">
            Copy
          </Button>
        )}
        {draft.status !== 'skipped' && (
          <Button size="sm" variant="ghost" onClick={() => onSkip(draft.id)} className="h-7 text-xs text-muted-foreground gap-1">
            <X className="w-3 h-3" /> Skip
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ApprovalCenter() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['all-drafts-approval'],
    queryFn: () => base44.entities.OutreachDraft.list('-created_date', 500),
  });

  const pending = drafts.filter(d => d.status === 'draft');
  const approved = drafts.filter(d => d.status === 'approved');
  const emailPending = pending.filter(d => d.channel === 'email');
  const linkedinPending = pending.filter(d => d.channel === 'linkedin');
  const phonePending = pending.filter(d => d.channel === 'phone');
  const emailApproved = approved.filter(d => d.channel === 'email');

  const handleApprove = async (id) => {
    setLoadingId(id);
    await base44.functions.invoke('approveDraft', { draft_id: id, action: 'approve' });
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setLoadingId(null);
    toast.success('Approved');
  };

  const handleSkip = async (id) => {
    setLoadingId(id);
    await base44.functions.invoke('approveDraft', { draft_id: id, action: 'skip' });
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setLoadingId(null);
  };

  const handleSend = async (id) => {
    setLoadingId(id);
    await base44.functions.invoke('sendEmail', { draft_id: id, test_mode: false });
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setLoadingId(null);
    toast.success('Email sent!');
  };

  const handleRegenerate = async (draft) => {
    setLoadingId(draft.id);
    await base44.functions.invoke('generateOutreach', { company_id: draft.company_id, channel: draft.channel });
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setLoadingId(null);
    toast.success('Regenerated');
  };

  const handleBulkApprove = async (draftList) => {
    setBulkLoading(true);
    const targets = selected.length > 0 ? draftList.filter(d => selected.includes(d.id)) : draftList;
    for (const d of targets) {
      await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' });
    }
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setSelected([]);
    setBulkLoading(false);
    toast.success(`${targets.length} drafts approved`);
  };

  const handleBulkSend = async () => {
    setBulkLoading(true);
    const targets = selected.length > 0
      ? emailApproved.filter(d => selected.includes(d.id))
      : emailApproved;
    for (const d of targets) {
      await base44.functions.invoke('sendEmail', { draft_id: d.id, test_mode: false });
    }
    qc.invalidateQueries({ queryKey: ['all-drafts-approval'] });
    setSelected([]);
    setBulkLoading(false);
    toast.success(`${targets.length} emails sent`);
  };

  const toggle = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const renderDraftList = (list, showSend = false) => (
    list.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Nothing here — all clear!
      </div>
    ) : (
      <div className="divide-y divide-border/30">
        {list.map(d => (
          <DraftRow
            key={d.id}
            draft={d}
            selected={selected.includes(d.id)}
            onToggle={() => toggle(d.id)}
            onApprove={handleApprove}
            onSkip={handleSkip}
            onSend={handleSend}
            onRegenerate={handleRegenerate}
            loading={loadingId === d.id}
          />
        ))}
      </div>
    )
  );

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Approval Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and send all outreach drafts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['all-drafts-approval'] })} className="gap-1.5 h-8 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Pending Approval', value: pending.length, color: 'text-amber-600' },
          { label: 'Email Approved', value: emailApproved.length, color: 'text-blue-600' },
          { label: 'LinkedIn Pending', value: linkedinPending.length, color: 'text-sky-600' },
          { label: 'Total Sent', value: drafts.filter(d => d.status === 'sent').length, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
          <span className="text-primary font-medium">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkApprove(pending)} disabled={bulkLoading} className="h-7 text-xs gap-1.5">
            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve Selected
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkSend} disabled={bulkLoading} className="h-7 text-xs gap-1.5 text-blue-600 border-blue-300">
            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send Selected Emails
          </Button>
          <button onClick={() => setSelected([])} className="ml-auto"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      )}

      <Card className="flex-1 overflow-hidden border-border/60">
        <div className="overflow-auto h-full">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : (
            <Tabs defaultValue="pending">
              <div className="px-4 pt-3 border-b border-border flex items-center justify-between">
                <TabsList className="h-8">
                  <TabsTrigger value="pending" className="text-xs">Pending ({pending.length})</TabsTrigger>
                  <TabsTrigger value="approved" className="text-xs">Approved ({approved.length})</TabsTrigger>
                  <TabsTrigger value="email" className="text-xs">Email ({emailPending.length})</TabsTrigger>
                  <TabsTrigger value="linkedin" className="text-xs">LinkedIn ({linkedinPending.length})</TabsTrigger>
                  <TabsTrigger value="phone" className="text-xs">Phone ({phonePending.length})</TabsTrigger>
                </TabsList>
                <div className="flex gap-2 pb-1">
                  {pending.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => handleBulkApprove(pending)} disabled={bulkLoading} className="h-7 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Approve All ({pending.length})
                    </Button>
                  )}
                  {emailApproved.length > 0 && (
                    <Button size="sm" onClick={handleBulkSend} disabled={bulkLoading} className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Send All Email ({emailApproved.length})
                    </Button>
                  )}
                </div>
              </div>
              <TabsContent value="pending" className="mt-0">{renderDraftList(pending)}</TabsContent>
              <TabsContent value="approved" className="mt-0">{renderDraftList(approved, true)}</TabsContent>
              <TabsContent value="email" className="mt-0">{renderDraftList(emailPending)}</TabsContent>
              <TabsContent value="linkedin" className="mt-0">{renderDraftList(linkedinPending)}</TabsContent>
              <TabsContent value="phone" className="mt-0">{renderDraftList(phonePending)}</TabsContent>
            </Tabs>
          )}
        </div>
      </Card>
    </div>
  );
}