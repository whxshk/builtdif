import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Plus, Search, X, Mail, Linkedin, Phone,
  Zap, CheckCircle2, Send, Building2,
  Loader2, Trash2, Play, Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STAGE_COLORS = {
  new:            'bg-gray-100 text-gray-600',
  queued:         'bg-slate-100 text-slate-600',
  generated:      'bg-blue-100 text-blue-600',
  approved:       'bg-indigo-100 text-indigo-700',
  contacted:      'bg-green-100 text-green-700',
  replied:        'bg-emerald-100 text-emerald-800',
  follow_up:      'bg-amber-100 text-amber-700',
  qualified:      'bg-purple-100 text-purple-700',
  not_interested: 'bg-red-100 text-red-600',
  skipped:        'bg-gray-100 text-gray-400',
};

const isOutreachReady = (c) => !!(c.primary_email || c.linkedin_url || c.primary_phone || c.whatsapp);

function AddCompaniesModal({ open, onClose, projectId, onAdded }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const { data: allCompanies = [] } = useQuery({
    queryKey: ['companies-for-add'],
    queryFn: () => base44.entities.Company.list('-created_date', 2000),
    enabled: open,
  });
  const { data: existingPcs = [] } = useQuery({
    queryKey: ['project-companies-existing', projectId],
    queryFn: () => base44.entities.ProjectCompany.filter({ project_id: projectId }),
    enabled: open,
  });

  const existingIds = new Set(existingPcs.map(pc => pc.company_id));
  const categories = [...new Set(allCompanies.map(c => c.category).filter(Boolean))].sort();

  const filtered = allCompanies.filter(c => {
    if (existingIds.has(c.id)) return false;
    if (search && !c.company_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (readinessFilter === 'ready' && !isOutreachReady(c)) return false;
    if (readinessFilter === 'needs_enrichment' && isOutreachReady(c)) return false;
    return true;
  });

  const selectedCompanies = allCompanies.filter(c => selected.includes(c.id));
  const selectedNotReady = selectedCompanies.filter(c => !isOutreachReady(c)).length;

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));

  const handleAdd = async () => {
    if (!selected.length) return;
    setLoading(true);
    const res = await base44.functions.invoke('projectOperations', { action: 'add_companies', project_id: projectId, company_ids: selected });
    toast.success(`Added ${res.data.added} companies`);
    if (res.data.skipped_duplicates > 0) toast.info(`${res.data.skipped_duplicates} already in campaign`);
    if (selectedNotReady > 0) toast.warning(`${selectedNotReady} companies have no contact channels — enrich them before generating drafts`);
    setSelected([]);
    onAdded();
    onClose();
    setLoading(false);
  };

  const readyCounts = {
    all: allCompanies.filter(c => !existingIds.has(c.id)).length,
    ready: allCompanies.filter(c => !existingIds.has(c.id) && isOutreachReady(c)).length,
    needs: allCompanies.filter(c => !existingIds.has(c.id) && !isOutreachReady(c)).length,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Add Companies to Campaign</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search companies..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter || 'all'} onValueChange={v => setCategoryFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={readinessFilter} onValueChange={setReadinessFilter}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All ({readyCounts.all})</SelectItem>
              <SelectItem value="ready" className="text-xs">Outreach ready ({readyCounts.ready})</SelectItem>
              <SelectItem value="needs_enrichment" className="text-xs">Needs enrichment ({readyCounts.needs})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 px-1 py-1.5 text-xs text-muted-foreground border-b border-border">
          <Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span>{filtered.length} shown · {selected.length} selected</span>
          {selectedNotReady > 0 && (
            <span className="text-amber-600 font-medium">{selectedNotReady} need enrichment</span>
          )}
          {selected.length > 0 && (
            <Button size="sm" onClick={handleAdd} disabled={loading} className="ml-auto h-7 text-xs gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add {selected.length}
            </Button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.slice(0, 200).map(c => {
            const ready = isOutreachReady(c);
            return (
              <div key={c.id} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/30 border-b border-border/20 cursor-pointer" onClick={() => toggleSelect(c.id)}>
                <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.company_name}</p>
                  <p className="text-xs text-muted-foreground">{[c.category, c.cr_number ? `CR ${c.cr_number}` : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex gap-1.5 items-center">
                  {c.primary_email && <Mail className="w-3.5 h-3.5 text-green-500" title="Email" />}
                  {c.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-sky-500" title="LinkedIn" />}
                  {(c.primary_phone || c.whatsapp) && <Phone className="w-3.5 h-3.5 text-purple-500" title="Phone/WhatsApp" />}
                  {!ready && (
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-600 rounded px-1 ml-1">needs enrichment</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No matching companies</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(null);
  const [activeTab, setActiveTab] = useState('companies');

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => base44.entities.Project.get(id),
  });
  const { data: projectCompanies = [], isLoading: loadingPcs } = useQuery({
    queryKey: ['project-companies', id],
    queryFn: () => base44.entities.ProjectCompany.filter({ project_id: id }, '-created_date', 1000),
  });
  const { data: allCompanies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 2000),
  });
  const { data: projectDrafts = [] } = useQuery({
    queryKey: ['project-drafts', id],
    queryFn: async () => {
      const companyIds = new Set(projectCompanies.map(pc => pc.company_id));
      const drafts = await base44.entities.OutreachDraft.list('-created_date', 1000);
      return drafts.filter(d => companyIds.has(d.company_id));
    },
    enabled: projectCompanies.length > 0,
  });

  const companyMap = useMemo(() => {
    const map = {};
    for (const c of allCompanies) map[c.id] = c;
    return map;
  }, [allCompanies]);

  const enrichedPcs = useMemo(() =>
    projectCompanies.map(pc => ({ ...pc, company: companyMap[pc.company_id] || null })),
    [projectCompanies, companyMap]
  );

  const filtered = enrichedPcs.filter(pc => {
    if (stageFilter !== 'all' && pc.outreach_stage !== stageFilter) return false;
    if (search && !pc.company_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = useMemo(() => {
    const companies = enrichedPcs.map(pc => pc.company).filter(Boolean);
    const stageCounts = {};
    for (const pc of enrichedPcs) stageCounts[pc.outreach_stage] = (stageCounts[pc.outreach_stage] || 0) + 1;
    return {
      total: enrichedPcs.length,
      outreach_ready: companies.filter(c => isOutreachReady(c)).length,
      needs_enrichment: companies.filter(c => !isOutreachReady(c)).length,
      email_ready: companies.filter(c => c?.primary_email).length,
      contacted: (stageCounts.contacted || 0) + (stageCounts.replied || 0) + (stageCounts.qualified || 0),
      stageCounts,
    };
  }, [enrichedPcs]);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(pc => pc.id));

  const handleBulkGenerate = async (channel) => {
    const companyIds = selected.length > 0
      ? enrichedPcs.filter(pc => selected.includes(pc.id)).map(pc => pc.company_id)
      : enrichedPcs.map(pc => pc.company_id);
    if (!companyIds.length) { toast.error('No companies to generate for'); return; }
    setBulkGenerating(channel || 'all');
    await base44.functions.invoke('generateOutreach', { bulk_ids: companyIds, channel: channel || undefined });
    for (const pc of enrichedPcs) {
      if (['new', 'queued'].includes(pc.outreach_stage)) {
        await base44.entities.ProjectCompany.update(pc.id, { outreach_stage: 'generated' });
      }
    }
    toast.success(`Drafts generated for ${companyIds.length} companies`);
    qc.invalidateQueries({ queryKey: ['project-companies', id] });
    qc.invalidateQueries({ queryKey: ['project-drafts', id] });
    setSelected([]);
    setBulkGenerating(null);
  };

  const handleBulkApprove = async () => {
    const pending = projectDrafts.filter(d => d.status === 'draft');
    if (!pending.length) { toast.info('No pending drafts'); return; }
    for (const d of pending) await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' });
    qc.invalidateQueries({ queryKey: ['project-drafts', id] });
    toast.success(`${pending.length} drafts approved`);
  };

  const handleScheduleAll = async () => {
    const approved = projectDrafts.filter(d => d.status === 'approved' && d.channel === 'email');
    if (!approved.length) { toast.info('No approved email drafts to schedule'); return; }
    const res = await base44.functions.invoke('complianceEngine', {
      action: 'schedule_bulk', project_id: id, draft_ids: approved.map(d => d.id), channel: 'email',
    });
    if (res.data?.success) {
      const r = res.data.results;
      toast.success(`Scheduled ${r.scheduled} sends.${r.compliance_blocked ? ` ${r.compliance_blocked} blocked.` : ''}`);
      qc.invalidateQueries();
    }
  };

  const handleStageUpdate = async (pcId, stage) => {
    await base44.entities.ProjectCompany.update(pcId, { outreach_stage: stage });
    qc.invalidateQueries({ queryKey: ['project-companies', id] });
  };

  const handleRemove = async (pcId) => {
    await base44.functions.invoke('projectOperations', { action: 'remove_company', project_company_id: pcId, project_id: id });
    qc.invalidateQueries({ queryKey: ['project-companies', id] });
    toast.success('Removed');
  };

  const handleProjectStatus = async (status) => {
    await base44.entities.Project.update(id, { status });
    qc.invalidateQueries({ queryKey: ['project', id] });
  };

  if (loadingProject) return <div className="p-8"><Skeleton className="h-24 w-full" /></div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Campaign not found</div>;

  const pendingDrafts = projectDrafts.filter(d => d.status === 'draft').length;
  const approvedDrafts = projectDrafts.filter(d => d.status === 'approved').length;
  const sentDrafts = projectDrafts.filter(d => d.status === 'sent').length;

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 bg-card flex items-center gap-3">
        <Link to="/campaigns">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold text-sm">{project.project_name}</span>
        <div className="ml-auto flex items-center gap-2">
          {project.status === 'draft' && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleProjectStatus('active')}><Play className="w-3.5 h-3.5 mr-1" />Activate</Button>}
          {project.status === 'active' && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleProjectStatus('paused')}><Pause className="w-3.5 h-3.5 mr-1" />Pause</Button>}
          <Badge className={cn('text-xs', { draft:'bg-gray-100 text-gray-600', active:'bg-green-100 text-green-700', paused:'bg-amber-100 text-amber-700', completed:'bg-blue-100 text-blue-700' }[project.status] || 'bg-gray-100 text-gray-600')}>
            {project.status}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* Left sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-border p-4 overflow-y-auto space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Summary</p>
            <div className="space-y-2">
              {[
                { label: 'Companies', value: stats.total },
                { label: 'Outreach Ready', value: stats.outreach_ready },
                { label: 'Needs Enrichment', value: stats.needs_enrichment },
                { label: 'Contacted', value: stats.contacted },
                { label: 'Pending Drafts', value: pendingDrafts },
                { label: 'Sent', value: sentDrafts },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Filter by Stage</p>
            <div className="space-y-0.5">
              {['all', 'new', 'generated', 'approved', 'contacted', 'replied', 'qualified', 'not_interested', 'skipped'].map(s => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={cn('w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex justify-between',
                    stageFilter === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <span className="capitalize">{s === 'all' ? 'All Stages' : s.replace(/_/g, ' ')}</span>
                  {s !== 'all' && stats.stageCounts[s] > 0 && <span className="text-[10px] bg-muted rounded px-1">{stats.stageCounts[s]}</span>}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 pt-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="companies" className="text-sm">Companies ({stats.total})</TabsTrigger>
                <TabsTrigger value="drafts" className="text-sm">
                  Drafts {projectDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{projectDrafts.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Companies tab */}
            <TabsContent value="companies" className="flex-1 p-5 mt-0">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddModal(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Companies
                </Button>
                {[
                  { ch: 'email', label: 'Gen Email', color: 'text-blue-600' },
                  { ch: null, label: 'Gen All', color: 'text-primary' },
                ].map(({ ch, label, color }) => (
                  <Button key={label} size="sm" variant="outline" onClick={() => handleBulkGenerate(ch)} disabled={bulkGenerating !== null} className={cn('h-9 text-xs gap-1', color)}>
                    {bulkGenerating === (ch || 'all') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    {label}
                  </Button>
                ))}
              </div>

              {selected.length > 0 && (
                <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                  <span className="font-medium text-primary">{selected.length} selected</span>
                  <Button size="sm" onClick={() => handleBulkGenerate('email')} disabled={bulkGenerating !== null} className="h-7 text-xs" variant="outline">
                    Gen Email for selected
                  </Button>
                  <button onClick={() => setSelected([])} className="ml-auto"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              )}

              <Card className="border-border/60 overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-320px)]">
                  {loadingPcs ? (
                    <div className="p-4 space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Building2 className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">No companies in this campaign yet</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Add Companies
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border z-10">
                        <tr>
                          <th className="w-10 px-3 py-2.5"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></th>
                          {['Company', 'Category', 'Channels', 'Stage', ''].map(h => (
                            <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(pc => (
                          <tr key={pc.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors group">
                            <td className="px-3 py-2.5"><Checkbox checked={selected.includes(pc.id)} onCheckedChange={() => toggleSelect(pc.id)} /></td>
                            <td className="px-3 py-2.5">
                              <Link to={`/companies/${pc.company_id}`} className="font-medium hover:text-primary text-sm">{pc.company_name}</Link>
                              {pc.company?.cr_number && <p className="text-xs font-mono text-muted-foreground">CR {pc.company.cr_number}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              {pc.company?.category ? <Badge variant="outline" className="text-xs">{pc.company.category}</Badge> : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1.5">
                                {pc.company?.primary_email && <Mail className="w-3.5 h-3.5 text-green-500" />}
                                {pc.company?.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-sky-500" />}
                                {pc.company?.primary_phone && <Phone className="w-3.5 h-3.5 text-purple-500" />}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <Select value={pc.outreach_stage} onValueChange={v => handleStageUpdate(pc.id, v)}>
                                <SelectTrigger className={cn('h-6 text-xs border-0 px-2 py-0 w-32 font-medium', STAGE_COLORS[pc.outreach_stage])}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.keys(STAGE_COLORS).map(s => (
                                    <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, ' ')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link to={`/companies/${pc.company_id}`}>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">Profile</Button>
                                </Link>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleRemove(pc.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            </TabsContent>

            {/* Drafts tab */}
            <TabsContent value="drafts" className="flex-1 p-5 mt-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">Pending: <strong className="text-amber-600">{pendingDrafts}</strong></span>
                  <span className="text-muted-foreground">Approved: <strong className="text-blue-600">{approvedDrafts}</strong></span>
                  <span className="text-muted-foreground">Sent: <strong className="text-green-600">{sentDrafts}</strong></span>
                </div>
                <div className="flex gap-2">
                  {pendingDrafts > 0 && (
                    <Button size="sm" variant="outline" onClick={handleBulkApprove} className="gap-1.5 text-xs h-8 border-green-300 text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve All ({pendingDrafts})
                    </Button>
                  )}
                  {approvedDrafts > 0 && (
                    <Button size="sm" onClick={handleScheduleAll} className="gap-1.5 text-xs h-8">
                      <Send className="w-3.5 h-3.5" /> Schedule Approved ({approvedDrafts})
                    </Button>
                  )}
                </div>
              </div>

              {projectDrafts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No drafts yet. Go to Companies tab and click "Gen Email".</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectDrafts.map(d => (
                    <div key={d.id} className={cn('flex items-start gap-3 p-3 bg-card border border-border/40 rounded-lg', d.status === 'sent' && 'opacity-60')}>
                      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', d.channel === 'email' ? 'bg-blue-100' : d.channel === 'linkedin' ? 'bg-sky-100' : 'bg-purple-100')}>
                        {d.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-blue-600" /> : d.channel === 'linkedin' ? <Linkedin className="w-3.5 h-3.5 text-sky-600" /> : <Phone className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/companies/${d.company_id}`} className="font-semibold text-sm hover:text-primary">{d.company_name}</Link>
                          <Badge variant="outline" className="text-xs">{d.draft_type?.replace(/_/g, ' ')}</Badge>
                          <Badge className={cn('text-xs', { draft:'bg-gray-100 text-gray-600', approved:'bg-blue-100 text-blue-700', sent:'bg-green-100 text-green-700', skipped:'bg-gray-100 text-gray-400' }[d.status])}>{d.status}</Badge>
                        </div>
                        {d.subject && <p className="text-xs font-medium mt-0.5">{d.subject}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.body?.substring(0, 120)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {d.status === 'draft' && (
                          <Button size="sm" onClick={async () => { await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' }); qc.invalidateQueries({ queryKey: ['project-drafts', id] }); toast.success('Approved'); }} className="h-7 text-xs">Approve</Button>
                        )}
                        {d.status === 'approved' && d.channel === 'email' && (
                          <Button size="sm" onClick={async () => { const r = await base44.functions.invoke('sendEmail', { draft_id: d.id }); qc.invalidateQueries({ queryKey: ['project-drafts', id] }); toast.success(r.data?.mode === 'test' ? 'Simulated (test mode)' : 'Sent'); }} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">Send</Button>
                        )}
                        {d.status === 'approved' && d.channel === 'linkedin' && (
                          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(d.body); toast.success('Copied!'); }} className="h-7 text-xs">Copy</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <AddCompaniesModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        projectId={id}
        onAdded={() => { qc.invalidateQueries({ queryKey: ['project-companies', id] }); qc.invalidateQueries({ queryKey: ['project', id] }); }}
      />
    </div>
  );
}