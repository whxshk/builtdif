import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getOllamaModel } from '@/api/localClient';
import { useLocation, Link } from 'react-router-dom';
import {
  Mail, Linkedin, Phone, CheckCircle2, Send,
  Copy, Loader2, Zap, X, ChevronRight,
  RefreshCw, Sparkles, Edit2, Save, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100 border-blue-200',
  linkedin: 'text-sky-600 bg-sky-100 border-sky-200',
  phone: 'text-purple-600 bg-purple-100 border-purple-200',
};
const STATUS_BADGE = {
  draft:     'bg-gray-100 text-gray-600',
  approved:  'bg-blue-100 text-blue-700',
  sent:      'bg-green-100 text-green-700',
  simulated: 'bg-amber-100 text-amber-700',
  failed:    'bg-red-100 text-red-600',
  skipped:   'bg-gray-100 text-gray-400',
};

function EditDraftModal({ draft, onClose, onSaved }) {
  const [subject, setSubject] = useState(draft?.subject || '');
  const [body, setBody] = useState(draft?.body || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (draft) { setSubject(draft.subject || ''); setBody(draft.body || ''); }
  }, [draft?.id]);

  const handleSave = async () => {
    setSaving(true);
    await base44.functions.invoke('approveDraft', {
      draft_id: draft.id,
      action: 'edit',
      updated_subject: subject,
      updated_body: body,
    });
    await onSaved();
    onClose();
    toast.success('Draft saved');
    setSaving(false);
  };

  return (
    <Dialog open={!!draft} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Draft — {draft?.company_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {draft?.channel === 'email' && (
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              className="text-sm resize-none font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !body.trim()} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Draft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function OutreachQueue() {
  const location = useLocation();
  const qc = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('draft');
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [bulkCompanyIds, setBulkCompanyIds] = useState([]);
  const [generatingId, setGeneratingId] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [ollamaModel, setOllamaModel] = useState(null);
  const [ollamaChecked, setOllamaChecked] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [editingDraft, setEditingDraft] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const bulk = params.get('bulk');
    if (bulk) setBulkCompanyIds(bulk.split(',').filter(Boolean));
  }, [location.search]);

  useEffect(() => {
    getOllamaModel().then(m => { setOllamaModel(m); setOllamaChecked(true); });
    base44.functions.invoke('appSettings', { action: 'get' })
      .then(res => { if (res.data?.settings) setTestMode(!!res.data.settings.test_mode); })
      .catch(() => {});
  }, []);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['all-drafts'],
    queryFn: () => base44.entities.OutreachDraft.list('-created_date', 500),
  });

  const filtered = drafts.filter(d => {
    if (selectedChannel !== 'all' && d.channel !== selectedChannel) return false;
    if (selectedStatus !== 'all' && d.status !== selectedStatus) return false;
    return true;
  });

  const emptyDrafts = filtered.filter(d => d.status === 'draft' && !d.body?.trim());

  const refresh = () => qc.invalidateQueries({ queryKey: ['all-drafts'] });

  const handleGenerate = async (draftId) => {
    setGeneratingId(draftId);
    try {
      const res = await base44.functions.invoke('generateOutreach', { draft_id: draftId });
      refresh();
      toast.success(res.data?.model && res.data.model !== 'template'
        ? `Generated with ${res.data.model}`
        : 'Generated with template (Ollama offline)');
    } catch {
      toast.error('Generation failed');
    }
    setGeneratingId(null);
  };

  const handleGenerateAll = async () => {
    if (!emptyDrafts.length) { toast.info('No empty drafts to generate'); return; }
    setGeneratingAll(true);
    let done = 0;
    const toastId = toast.loading(`Generating 0 / ${emptyDrafts.length}…`);
    for (const d of emptyDrafts) {
      try {
        await base44.functions.invoke('generateOutreach', { draft_id: d.id });
        done++;
        toast.loading(`Generating ${done} / ${emptyDrafts.length}…`, { id: toastId });
      } catch { /* skip */ }
    }
    refresh();
    toast.success(`Generated ${done} drafts`, { id: toastId });
    setGeneratingAll(false);
  };

  const handleBulkGenerate = async (channel) => {
    if (!bulkCompanyIds.length) return;
    setGeneratingAll(true);
    try {
      const res = await base44.functions.invoke('generateOutreach', { bulk_ids: bulkCompanyIds, channel: channel || undefined });
      const d = res.data || {};
      const skipped = d.skipped_no_email || 0;
      toast.success(`Generated ${d.generated || 0} drafts${skipped > 0 ? ` · ${skipped} skipped (no email)` : ''}`);
      refresh();
      setBulkCompanyIds([]);
    } catch { toast.error('Bulk generation failed'); }
    setGeneratingAll(false);
  };

  const handleApprove = async (draftId) => {
    await base44.functions.invoke('approveDraft', { draft_id: draftId, action: 'approve' });
    refresh();
    toast.success('Approved');
  };

  const handleApproveAll = async () => {
    const toApprove = selectedDrafts.length > 0
      ? filtered.filter(d => selectedDrafts.includes(d.id) && d.status === 'draft')
      : filtered.filter(d => d.status === 'draft' && d.body?.trim());
    for (const d of toApprove) await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' });
    refresh();
    toast.success(`${toApprove.length} drafts approved`);
    setSelectedDrafts([]);
  };

  const handleSendEmail = async (draftId) => {
    try {
      const res = await base44.functions.invoke('sendEmail', { draft_id: draftId });
      refresh();
      if (res.data?.success) {
        toast.success(res.data.mode === 'test' ? 'Email simulated (test mode)' : 'Email sent');
      } else {
        toast.error(res.data?.error || 'Send failed');
      }
    } catch {
      toast.error('Unexpected error sending email');
    }
  };

  const handleCopy = async (draft) => {
    await navigator.clipboard.writeText(draft.body || '');
    toast.success('Copied!');
  };

  const handleSkip = async (draftId) => {
    await base44.functions.invoke('approveDraft', { draft_id: draftId, action: 'skip' });
    refresh();
  };

  const toggleDraft = (id) => setSelectedDrafts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedDrafts(selectedDrafts.length === filtered.length ? [] : filtered.map(d => d.id));

  const counts = {
    all: drafts.length,
    email: drafts.filter(d => d.channel === 'email').length,
    linkedin: drafts.filter(d => d.channel === 'linkedin').length,
    phone: drafts.filter(d => d.channel === 'phone').length,
  };
  const statusCounts = {
    draft:     drafts.filter(d => d.status === 'draft').length,
    approved:  drafts.filter(d => d.status === 'approved').length,
    sent:      drafts.filter(d => d.status === 'sent' && !d.simulated).length,
    simulated: drafts.filter(d => d.simulated).length,
    failed:    drafts.filter(d => d.status === 'failed').length,
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Outreach Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review, generate, approve, and send outreach drafts</p>
        </div>
        <div className="flex items-center gap-2">
          {testMode && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Test mode — no real emails sent
            </div>
          )}
          {ollamaChecked && (
            <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border',
              ollamaModel ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'
            )}>
              <div className={cn('w-1.5 h-1.5 rounded-full', ollamaModel ? 'bg-green-500' : 'bg-gray-400')} />
              {ollamaModel ? `Ollama: ${ollamaModel}` : 'Ollama offline (templates)'}
            </div>
          )}
          {emptyDrafts.length > 0 && (
            <Button size="sm" onClick={handleGenerateAll} disabled={generatingAll} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
              {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate All with AI ({emptyDrafts.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Bulk generate banner */}
      {bulkCompanyIds.length > 0 && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{bulkCompanyIds.length} companies for bulk generation</span>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => handleBulkGenerate('email')} disabled={generatingAll} className="h-7 text-xs gap-1.5">
                  {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email only
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => setBulkCompanyIds([])}><X className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total',     value: counts.all,           color: 'text-foreground' },
          { label: 'Draft',     value: statusCounts.draft,   color: 'text-gray-600' },
          { label: 'Approved',  value: statusCounts.approved, color: 'text-blue-600' },
          { label: 'Sent',      value: statusCounts.sent,    color: 'text-green-600' },
          { label: 'Simulated', value: statusCounts.simulated, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {[
            { value: 'all', label: `All (${counts.all})` },
            { value: 'email', label: `Email (${counts.email})` },
            { value: 'linkedin', label: `LinkedIn (${counts.linkedin})` },
            { value: 'phone', label: `Phone (${counts.phone})` },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => setSelectedChannel(value)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                selectedChannel === value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}>{label}</button>
          ))}
        </div>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="h-9 text-xs w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        {filtered.filter(d => d.status === 'draft' && d.body?.trim()).length > 0 && (
          <Button size="sm" variant="outline" onClick={handleApproveAll} className="h-9 text-xs gap-1.5 ml-auto border-green-300 text-green-700 hover:bg-green-50">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve All ({filtered.filter(d => d.status === 'draft' && d.body?.trim()).length})
          </Button>
        )}
      </div>

      {/* Draft list */}
      <Card className="flex-1 overflow-hidden border-border/60">
        <div className="overflow-auto h-full">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Send className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">No drafts in this view</p>
              <p className="text-sm mt-1">Import an Excel file with email addresses to populate the queue</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
                <Checkbox checked={selectedDrafts.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                <span>{filtered.length} drafts · {selectedDrafts.length} selected</span>
              </div>

              {filtered.map(draft => {
                const DIcon = CHANNEL_ICONS[draft.channel] || Mail;
                const isEmpty = !draft.body?.trim();
                const isGenerating = generatingId === draft.id;
                const isFailed = draft.status === 'failed';

                return (
                  <div key={draft.id} className={cn('p-4 hover:bg-muted/20 transition-colors', (draft.status === 'sent' || draft.status === 'skipped') && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selectedDrafts.includes(draft.id)} onCheckedChange={() => toggleDraft(draft.id)} className="mt-0.5" />
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${CHANNEL_COLORS[draft.channel]}`}>
                        <DIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/companies/${draft.company_id}`} className="font-semibold text-sm hover:text-primary transition-colors">
                            {draft.company_name}
                          </Link>
                          <Badge variant="outline" className="text-xs">{draft.draft_type?.replace(/_/g, ' ')}</Badge>
                          <Badge className={cn('text-xs', STATUS_BADGE[draft.status])}>{draft.status}</Badge>
                          {draft.simulated && <Badge className="text-xs bg-amber-50 text-amber-600 border border-amber-200">simulated</Badge>}
                          {isEmpty && draft.status === 'draft' && (
                            <Badge className="text-xs bg-amber-50 text-amber-600 border border-amber-200">needs generation</Badge>
                          )}
                          {draft.ai_model_used && (
                            <Badge className="text-xs bg-violet-50 text-violet-600 border border-violet-200">AI: {draft.ai_model_used.split(':')[0]}</Badge>
                          )}
                        </div>
                        {draft.subject && <p className="text-xs font-medium text-foreground mt-0.5">{draft.subject}</p>}
                        {draft.recipient_email && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">To: {draft.recipient_email}</p>
                        )}
                        {isEmpty ? (
                          <p className="text-xs text-muted-foreground/60 mt-1 italic">No content yet — click Generate</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{draft.body?.substring(0, 200)}</p>
                        )}
                        {isFailed && draft.last_error && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                            <p className="text-xs text-red-600">{draft.last_error}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {draft.status === 'draft' && (
                          <Button size="sm" variant={isEmpty ? 'default' : 'outline'} onClick={() => handleGenerate(draft.id)}
                            disabled={isGenerating || generatingAll}
                            className={cn('h-7 text-xs gap-1', isEmpty ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'text-muted-foreground')}>
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {isEmpty ? 'Generate' : 'Regen'}
                          </Button>
                        )}
                        {/* Edit button */}
                        {(draft.status === 'draft' || draft.status === 'approved') && !isEmpty && (
                          <Button size="sm" variant="outline" onClick={() => setEditingDraft(draft)} className="h-7 text-xs gap-1 text-muted-foreground">
                            <Edit2 className="w-3 h-3" /> Edit
                          </Button>
                        )}
                        {draft.status === 'draft' && !isEmpty && (
                          <Button size="sm" onClick={() => handleApprove(draft.id)} className="h-7 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </Button>
                        )}
                        {draft.status === 'approved' && draft.channel === 'email' && (
                          <Button size="sm" onClick={() => handleSendEmail(draft.id)}
                            className={cn('h-7 text-xs gap-1', testMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white')}>
                            <Send className="w-3 h-3" /> {testMode ? 'Simulate' : 'Send'}
                          </Button>
                        )}
                        {isFailed && draft.channel === 'email' && (
                          <Button size="sm" onClick={() => handleSendEmail(draft.id)} variant="outline"
                            className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50">
                            <RefreshCw className="w-3 h-3" /> Retry
                          </Button>
                        )}
                        {draft.status === 'approved' && draft.channel === 'linkedin' && (
                          <Button size="sm" variant="outline" onClick={() => handleCopy(draft)} className="h-7 text-xs gap-1 border-sky-300 text-sky-700">
                            <Copy className="w-3 h-3" /> Copy msg
                          </Button>
                        )}
                        {draft.status !== 'sent' && draft.status !== 'skipped' && draft.status !== 'failed' && (
                          <Button size="sm" variant="ghost" onClick={() => handleSkip(draft.id)} className="h-7 text-xs text-muted-foreground">Skip</Button>
                        )}
                        <Link to={`/companies/${draft.company_id}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground">
                            Profile <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <EditDraftModal
        draft={editingDraft}
        onClose={() => setEditingDraft(null)}
        onSaved={refresh}
      />
    </div>
  );
}
