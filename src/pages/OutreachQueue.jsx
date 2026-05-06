import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getOllamaModel } from '@/api/localClient';
import { useLocation, Link } from 'react-router-dom';
import {
  Mail, Linkedin, Phone, CheckCircle2, Send,
  Copy, Loader2, Zap, X, ChevronRight,
  RefreshCw, Sparkles, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100 border-blue-200',
  linkedin: 'text-sky-600 bg-sky-100 border-sky-200',
  phone: 'text-purple-600 bg-purple-100 border-purple-200',
};
const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  skipped: 'bg-gray-100 text-gray-400',
};

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const bulk = params.get('bulk');
    if (bulk) setBulkCompanyIds(bulk.split(',').filter(Boolean));
  }, [location.search]);

  useEffect(() => {
    getOllamaModel().then(m => { setOllamaModel(m); setOllamaChecked(true); });
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

  const handleGenerate = async (draftId) => {
    setGeneratingId(draftId);
    try {
      const res = await base44.functions.invoke('generateOutreach', { draft_id: draftId });
      qc.invalidateQueries({ queryKey: ['all-drafts'] });
      toast.success(res.data?.model && res.data.model !== 'template'
        ? `Generated with ${res.data.model}`
        : 'Generated with template (Ollama not running)');
    } catch {
      toast.error('Generation failed');
    }
    setGeneratingId(null);
  };

  const handleGenerateAll = async () => {
    if (!emptyDrafts.length) { toast.info('No empty drafts to generate'); return; }
    setGeneratingAll(true);
    let done = 0;
    const toastId = toast.loading(`Generating 0 / ${emptyDrafts.length}...`);
    for (const d of emptyDrafts) {
      try {
        await base44.functions.invoke('generateOutreach', { draft_id: d.id });
        done++;
        toast.loading(`Generating ${done} / ${emptyDrafts.length}...`, { id: toastId });
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ['all-drafts'] });
    toast.success(`Generated ${done} drafts`, { id: toastId });
    setGeneratingAll(false);
  };

  const handleBulkGenerate = async (channel) => {
    if (!bulkCompanyIds.length) return;
    setGeneratingAll(true);
    try {
      await base44.functions.invoke('generateOutreach', { bulk_ids: bulkCompanyIds, channel: channel || undefined });
      toast.success(`Drafts generated for ${bulkCompanyIds.length} companies`);
      qc.invalidateQueries({ queryKey: ['all-drafts'] });
      setBulkCompanyIds([]);
    } catch { toast.error('Bulk generation failed'); }
    setGeneratingAll(false);
  };

  const handleApprove = async (draftId) => {
    await base44.functions.invoke('approveDraft', { draft_id: draftId, action: 'approve' });
    qc.invalidateQueries({ queryKey: ['all-drafts'] });
    toast.success('Approved');
  };

  const handleApproveAll = async () => {
    const toApprove = selectedDrafts.length > 0
      ? filtered.filter(d => selectedDrafts.includes(d.id) && d.status === 'draft')
      : filtered.filter(d => d.status === 'draft' && d.body?.trim());
    for (const d of toApprove) await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' });
    qc.invalidateQueries({ queryKey: ['all-drafts'] });
    toast.success(`${toApprove.length} drafts approved`);
    setSelectedDrafts([]);
  };

  const handleSendEmail = async (draftId) => {
    const res = await base44.functions.invoke('sendEmail', { draft_id: draftId });
    qc.invalidateQueries({ queryKey: ['all-drafts'] });
    toast.success(res.data?.mode === 'test' ? 'Email simulated (test mode)' : 'Email sent');
  };

  const handleCopy = async (draft) => {
    await navigator.clipboard.writeText(draft.body || '');
    toast.success('Copied!');
  };

  const handleSkip = async (draftId) => {
    await base44.functions.invoke('approveDraft', { draft_id: draftId, action: 'skip' });
    qc.invalidateQueries({ queryKey: ['all-drafts'] });
  };

  const toggleDraft = (id) => setSelectedDrafts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedDrafts(selectedDrafts.length === filtered.length ? [] : filtered.map(d => d.id));

  const counts = {
    all: drafts.length, email: drafts.filter(d => d.channel === 'email').length,
    linkedin: drafts.filter(d => d.channel === 'linkedin').length, phone: drafts.filter(d => d.channel === 'phone').length,
  };
  const statusCounts = {
    draft: drafts.filter(d => d.status === 'draft').length,
    approved: drafts.filter(d => d.status === 'approved').length,
    sent: drafts.filter(d => d.status === 'sent').length,
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Outreach Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review, generate, approve, and send outreach drafts</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Ollama status */}
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
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['all-drafts'] })} className="gap-1.5">
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
                {['email', 'linkedin', 'phone'].map(ch => {
                  const CIcon = CHANNEL_ICONS[ch];
                  return (
                    <Button key={ch} size="sm" variant="outline" onClick={() => handleBulkGenerate(ch)} disabled={generatingAll} className="h-7 text-xs gap-1.5">
                      {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CIcon className="w-3.5 h-3.5" />} {ch}
                    </Button>
                  );
                })}
                <Button size="sm" onClick={() => handleBulkGenerate(null)} disabled={generatingAll} className="h-7 text-xs gap-1.5">
                  {generatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} All
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={() => setBulkCompanyIds([])}><X className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Drafts', value: counts.all, color: 'text-foreground' },
          { label: 'Pending', value: statusCounts.draft, color: 'text-amber-600' },
          { label: 'Approved', value: statusCounts.approved, color: 'text-blue-600' },
          { label: 'Sent', value: statusCounts.sent, color: 'text-green-600' },
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
          <SelectTrigger className="h-9 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
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
              <p className="text-sm mt-1">Import an Excel file with contact info to populate the queue</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {/* Select all bar */}
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
                <Checkbox checked={selectedDrafts.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                <span>{filtered.length} drafts · {selectedDrafts.length} selected</span>
              </div>

              {filtered.map(draft => {
                const DIcon = CHANNEL_ICONS[draft.channel] || Mail;
                const isEmpty = !draft.body?.trim();
                const isGenerating = generatingId === draft.id;

                return (
                  <div key={draft.id} className={cn('p-4 hover:bg-muted/20 transition-colors', draft.status === 'sent' && 'opacity-60')}>
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
                          {isEmpty && draft.status === 'draft' && (
                            <Badge className="text-xs bg-amber-50 text-amber-600 border border-amber-200">needs generation</Badge>
                          )}
                        </div>
                        {draft.subject && <p className="text-xs font-medium text-foreground mt-0.5">{draft.subject}</p>}
                        {isEmpty ? (
                          <p className="text-xs text-muted-foreground/60 mt-1 italic">No content yet — click Generate to create with AI</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{draft.body?.substring(0, 200)}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {/* Generate button — shown when empty or as regenerate */}
                        {draft.status === 'draft' && (
                          <Button size="sm" variant={isEmpty ? 'default' : 'outline'} onClick={() => handleGenerate(draft.id)}
                            disabled={isGenerating || generatingAll}
                            className={cn('h-7 text-xs gap-1', isEmpty ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'text-muted-foreground')}>
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {isEmpty ? 'Generate' : 'Regenerate'}
                          </Button>
                        )}
                        {/* Approve — only if has content */}
                        {draft.status === 'draft' && !isEmpty && (
                          <Button size="sm" onClick={() => handleApprove(draft.id)} className="h-7 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </Button>
                        )}
                        {draft.status === 'approved' && draft.channel === 'email' && (
                          <Button size="sm" onClick={() => handleSendEmail(draft.id)} className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                            <Send className="w-3 h-3" /> Send
                          </Button>
                        )}
                        {draft.status === 'approved' && draft.channel === 'linkedin' && (
                          <Button size="sm" variant="outline" onClick={() => handleCopy(draft)} className="h-7 text-xs gap-1 border-sky-300 text-sky-700">
                            <Copy className="w-3 h-3" /> Copy
                          </Button>
                        )}
                        {draft.status === 'approved' && draft.channel === 'phone' && (
                          <Link to={`/companies/${draft.company_id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-purple-300 text-purple-700">
                              <Phone className="w-3 h-3" /> Log Call
                            </Button>
                          </Link>
                        )}
                        {draft.status !== 'sent' && draft.status !== 'skipped' && (
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
    </div>
  );
}
