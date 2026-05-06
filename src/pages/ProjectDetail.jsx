import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Plus, Search, X, Mail, Linkedin, Phone,
  Zap, CheckCircle2, Send, Loader2, Building2,
  Play, Pause, Archive, Trash2, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

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

const PIE_COLORS = ['#6366f1','#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#14b8a6','#64748b','#10b981','#94a3b8'];

function AddCompaniesModal({ open, onClose, projectId, onAdded }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({ category: '', has_email: '', has_linkedin: '' });
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
    if (filters.category && c.category !== filters.category) return false;
    if (filters.has_email === 'yes' && !c.primary_email) return false;
    if (filters.has_email === 'no' && c.primary_email) return false;
    if (filters.has_linkedin === 'yes' && !c.linkedin_url) return false;
    if (filters.has_linkedin === 'no' && c.linkedin_url) return false;
    return true;
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));

  const handleAdd = async () => {
    if (!selected.length) return;
    setLoading(true);
    const res = await base44.functions.invoke('projectOperations', { action: 'add_companies', project_id: projectId, company_ids: selected });
    toast.success(`Added ${res.data.added} companies`);
    if (res.data.skipped_duplicates > 0) toast.info(`${res.data.skipped_duplicates} already in project`);
    setSelected([]);
    onAdded();
    onClose();
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Companies to Project</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search companies..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filters.category || 'all'} onValueChange={v => setFilters(f => ({ ...f, category: v === 'all' ? '' : v }))}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.has_email || 'any'} onValueChange={v => setFilters(f => ({ ...f, has_email: v === 'any' ? '' : v }))}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Email" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="yes">Has Email</SelectItem>
              <SelectItem value="no">No Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.has_linkedin || 'any'} onValueChange={v => setFilters(f => ({ ...f, has_linkedin: v === 'any' ? '' : v }))}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="LinkedIn" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="yes">Has LinkedIn</SelectItem>
              <SelectItem value="no">No LinkedIn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 px-1 py-1.5 text-xs text-muted-foreground border-b border-border">
          <Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span>{filtered.length} available · {selected.length} selected</span>
          {selected.length > 0 && (
            <Button size="sm" onClick={handleAdd} disabled={loading} className="ml-auto h-7 text-xs gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add {selected.length} Companies
            </Button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.slice(0, 100).map(c => (
            <div key={c.id} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/30 border-b border-border/20 cursor-pointer" onClick={() => toggleSelect(c.id)}>
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.company_name}</p>
                <p className="text-xs text-muted-foreground">{c.category} {c.cr_number ? `· CR ${c.cr_number}` : ''}</p>
              </div>
              <div className="flex gap-1.5">
                {c.primary_email && <Mail className="w-3.5 h-3.5 text-green-500" />}
                {c.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-sky-500" />}
                {c.primary_phone && <Phone className="w-3.5 h-3.5 text-purple-500" />}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No matching companies</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectDetail() {
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
      const drafts = await base44.entities.OutreachDraft.list('-created_date', 500);
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

  // Stats
  const stats = useMemo(() => {
    const companies = enrichedPcs.map(pc => pc.company).filter(Boolean);
    const stageCounts = {};
    for (const pc of enrichedPcs) stageCounts[pc.outreach_stage] = (stageCounts[pc.outreach_stage] || 0) + 1;
    return {
      total: enrichedPcs.length,
      email_ready: companies.filter(c => c?.primary_email).length,
      linkedin_ready: companies.filter(c => c?.linkedin_url).length,
      phone_ready: companies.filter(c => c?.primary_phone).length,
      contacted: (stageCounts.contacted || 0) + (stageCounts.replied || 0) + (stageCounts.qualified || 0),
      replied: stageCounts.replied || 0,
      qualified: stageCounts.qualified || 0,
      not_interested: stageCounts.not_interested || 0,
      generated: stageCounts.generated || 0,
      stageCounts,
    };
  }, [enrichedPcs]);

  const stageChartData = Object.entries(stats.stageCounts).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  const channelData = [
    { name: 'Email', value: stats.email_ready },
    { name: 'LinkedIn', value: stats.linkedin_ready },
    { name: 'Phone', value: stats.phone_ready },
  ];

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(pc => pc.id));

  const handleBulkGenerate = async (channel) => {
    const idsToUse = selected.length > 0 ? selected : null;
    setBulkGenerating(channel || 'all');

    const companyIds = idsToUse
      ? enrichedPcs.filter(pc => idsToUse.includes(pc.id)).map(pc => pc.company_id)
      : enrichedPcs.filter(pc => stageFilter === 'all' || pc.outreach_stage === stageFilter).map(pc => pc.company_id);

    if (!companyIds.length) { toast.error('No companies to generate for'); setBulkGenerating(null); return; }

    await base44.functions.invoke('generateOutreach', { bulk_ids: companyIds, channel: channel || undefined });

    // Update stages to 'generated'
    const pcsToUpdate = idsToUse
      ? enrichedPcs.filter(pc => idsToUse.includes(pc.id))
      : enrichedPcs;
    for (const pc of pcsToUpdate) {
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
    const draftIds = projectDrafts.filter(d => d.status === 'draft').map(d => d.id);
    if (!draftIds.length) { toast.info('No pending drafts'); return; }
    for (const did of draftIds) {
      await base44.functions.invoke('approveDraft', { draft_id: did, action: 'approve' });
    }
    qc.invalidateQueries({ queryKey: ['project-drafts', id] });
    toast.success(`${draftIds.length} drafts approved`);
  };

  const handleStageUpdate = async (pcId, stage) => {
    await base44.entities.ProjectCompany.update(pcId, { outreach_stage: stage });
    qc.invalidateQueries({ queryKey: ['project-companies', id] });
  };

  const handleRemove = async (pcId) => {
    await base44.functions.invoke('projectOperations', { action: 'remove_company', project_company_id: pcId, project_id: id });
    qc.invalidateQueries({ queryKey: ['project-companies', id] });
    qc.invalidateQueries({ queryKey: ['project', id] });
    toast.success('Company removed');
  };

  const handleProjectStatusChange = async (status) => {
    await base44.entities.Project.update(id, { status });
    qc.invalidateQueries({ queryKey: ['project', id] });
  };

  if (loadingProject) return <div className="p-8"><Skeleton className="h-24 w-full" /></div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  const completion = stats.total > 0 ? Math.round(stats.contacted / stats.total * 100) : 0;
  const pendingDrafts = projectDrafts.filter(d => d.status === 'draft').length;
  const approvedDrafts = projectDrafts.filter(d => d.status === 'approved').length;

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 bg-card flex items-center gap-3">
        <Link to="/projects">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold text-sm">{project.project_name}</span>
        <div className="ml-auto flex items-center gap-2">
          {project.status === 'draft' && <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleProjectStatusChange('active')}><Play className="w-3.5 h-3.5" />Activate</Button>}
          {project.status === 'active' && <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleProjectStatusChange('paused')}><Pause className="w-3.5 h-3.5" />Pause</Button>}
          {project.status === 'paused' && <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleProjectStatusChange('active')}><Play className="w-3.5 h-3.5" />Resume</Button>}
          <Badge className={cn('text-xs', { draft:'bg-gray-100 text-gray-600', active:'bg-green-100 text-green-700', paused:'bg-amber-100 text-amber-700', completed:'bg-blue-100 text-blue-700', archived:'bg-gray-100 text-gray-400' }[project.status] || '')}>
            {project.status}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* Left sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-border p-4 overflow-y-auto space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Campaign Info</p>
            {[
              { label: 'Type', value: project.campaign_type?.replace('_', ' ') },
              { label: 'Owner', value: project.owner },
              { label: 'Category', value: project.target_category },
              { label: 'Region', value: project.target_region },
              { label: 'Goal', value: project.outreach_goal },
              { label: 'Start', value: project.start_date },
              { label: 'End', value: project.end_date },
            ].filter(i => i.value).map(({ label, value }) => (
              <div key={label} className="flex items-start gap-2 mb-1.5">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">{label}</span>
                <span className="text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Progress</p>
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: `${completion}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{completion}% contacted · {stats.contacted}/{stats.total}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Filter by Stage</p>
            <div className="space-y-0.5">
              {['all', 'new', 'queued', 'generated', 'approved', 'contacted', 'replied', 'follow_up', 'qualified', 'not_interested', 'skipped'].map(s => (
                <button
                  key={s}
                  onClick={() => setStageFilter(s)}
                  className={cn('w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-between',
                    stageFilter === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <span className="capitalize">{s === 'all' ? 'All Stages' : s.replace(/_/g, ' ')}</span>
                  {s !== 'all' && stats.stageCounts[s] > 0 && (
                    <span className="text-[10px] bg-muted rounded px-1.5 py-0.5">{stats.stageCounts[s]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 pt-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="companies" className="text-sm">Companies ({stats.total})</TabsTrigger>
                <TabsTrigger value="drafts" className="text-sm">
                  Drafts {projectDrafts.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{projectDrafts.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="analytics" className="text-sm">Analytics</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="companies" className="flex-1 p-6 mt-0">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search companies..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddModal(true)} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Companies
                </Button>
                <div className="flex items-center gap-1 border border-border/60 rounded-md p-1">
                  {[
                    { ch: 'email', icon: Mail, label: 'Email', color: 'text-blue-600' },
                    { ch: 'linkedin', icon: Linkedin, label: 'LinkedIn', color: 'text-sky-600' },
                    { ch: 'phone', icon: Phone, label: 'Phone', color: 'text-purple-600' },
                    { ch: null, icon: Zap, label: 'All', color: 'text-primary' },
                  ].map(({ ch, icon: Icon, label, color }) => (
                    <Button
                      key={label}
                      size="sm"
                      variant="ghost"
                      onClick={() => handleBulkGenerate(ch)}
                      disabled={bulkGenerating !== null}
                      className={cn('h-7 text-xs gap-1.5', color)}
                    >
                      {bulkGenerating === (ch || 'all') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                      Gen {label}
                    </Button>
                  ))}
                </div>
              </div>

              {selected.length > 0 && (
                <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                  <span className="font-medium text-primary">{selected.length} selected</span>
                  {[
                    { ch: 'email', label: 'Gen Email', color: 'text-blue-600' },
                    { ch: 'linkedin', label: 'Gen LinkedIn', color: 'text-sky-600' },
                    { ch: null, label: 'Gen All', color: 'text-primary' },
                  ].map(({ ch, label, color }) => (
                    <Button key={label} size="sm" onClick={() => handleBulkGenerate(ch)} disabled={bulkGenerating !== null} className={cn('h-7 text-xs', color)} variant="outline">
                      {bulkGenerating === (ch || 'all') ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                      {label}
                    </Button>
                  ))}
                  <button onClick={() => setSelected([])} className="ml-auto text-muted-foreground"><X className="w-4 h-4" /></button>
                </div>
              )}

              <Card className="border-border/60 overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-320px)]">
                  {loadingPcs ? (
                    <div className="p-4 space-y-2">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Building2 className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">No companies in this project yet</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Add Companies
                      </Button>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border z-10">
                        <tr>
                          <th className="w-10 px-3 py-2.5">
                            <Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                          </th>
                          {['Company', 'Category', 'Channels', 'Stage', 'Priority', ''].map(h => (
                            <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(pc => (
                          <tr key={pc.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors group">
                            <td className="px-3 py-2.5">
                              <Checkbox checked={selected.includes(pc.id)} onCheckedChange={() => toggleSelect(pc.id)} />
                            </td>
                            <td className="px-3 py-2.5">
                              <Link to={`/companies/${pc.company_id}`} className="font-medium hover:text-primary transition-colors text-sm">
                                {pc.company_name}
                              </Link>
                              {pc.company?.cr_number && <p className="text-xs font-mono text-muted-foreground">CR {pc.company.cr_number}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              {pc.company?.category ? <Badge variant="outline" className="text-xs">{pc.company.category}</Badge> : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                {pc.company?.primary_email && <Mail className="w-3.5 h-3.5 text-green-500" />}
                                {pc.company?.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-sky-500" />}
                                {pc.company?.primary_phone && <Phone className="w-3.5 h-3.5 text-purple-500" />}
                                {pc.company?.website && <Globe className="w-3.5 h-3.5 text-blue-400" />}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <Select value={pc.outreach_stage} onValueChange={v => handleStageUpdate(pc.id, v)}>
                                <SelectTrigger className={cn('h-6 text-xs border-0 px-2 py-0 w-32 font-medium', STAGE_COLORS[pc.outreach_stage])}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {['new','queued','generated','approved','contacted','replied','follow_up','qualified','not_interested','skipped'].map(s => (
                                    <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, ' ')}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className={cn('text-xs', pc.priority === 'high' ? 'border-red-300 text-red-600' : pc.priority === 'low' ? 'border-gray-300 text-gray-500' : '')}>
                                {pc.priority}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link to={`/companies/${pc.company_id}`}>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">Profile</Button>
                                </Link>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => handleRemove(pc.id)}>
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

            <TabsContent value="drafts" className="flex-1 p-6 mt-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-3 text-sm">
                  <span className="text-muted-foreground">Total: <strong>{projectDrafts.length}</strong></span>
                  <span className="text-amber-600">Pending: <strong>{pendingDrafts}</strong></span>
                  <span className="text-blue-600">Approved: <strong>{approvedDrafts}</strong></span>
                  <span className="text-green-600">Sent: <strong>{projectDrafts.filter(d => d.status === 'sent').length}</strong></span>
                </div>
                {pendingDrafts > 0 && (
                  <Button size="sm" onClick={handleBulkApprove} className="gap-1.5 text-xs h-8">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve All ({pendingDrafts})
                  </Button>
                )}
              </div>
              {projectDrafts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No drafts yet. Generate outreach from the Companies tab.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectDrafts.map(d => (
                    <div key={d.id} className="flex items-start gap-3 p-3 bg-card border border-border/40 rounded-lg hover:shadow-sm transition-shadow">
                      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                        d.channel === 'email' ? 'bg-blue-100' : d.channel === 'linkedin' ? 'bg-sky-100' : 'bg-purple-100'
                      )}>
                        {d.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-blue-600" /> : d.channel === 'linkedin' ? <Linkedin className="w-3.5 h-3.5 text-sky-600" /> : <Phone className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/companies/${d.company_id}`} className="font-semibold text-sm hover:text-primary">{d.company_name}</Link>
                          <Badge variant="outline" className="text-xs">{d.draft_type?.replace(/_/g, ' ')}</Badge>
                          <Badge className={cn('text-xs', {draft:'bg-gray-100 text-gray-600',approved:'bg-blue-100 text-blue-700',sent:'bg-green-100 text-green-700',skipped:'bg-gray-100 text-gray-400',failed:'bg-red-100 text-red-600'}[d.status])}>{d.status}</Badge>
                        </div>
                        {d.subject && <p className="text-xs font-medium mt-0.5">{d.subject}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.body?.substring(0, 120)}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {d.status === 'draft' && (
                          <Button size="sm" onClick={async () => { await base44.functions.invoke('approveDraft', { draft_id: d.id, action: 'approve' }); qc.invalidateQueries({ queryKey: ['project-drafts', id] }); toast.success('Approved'); }} className="h-7 text-xs">Approve</Button>
                        )}
                        {d.status === 'approved' && d.channel === 'email' && (
                          <Button size="sm" onClick={async () => { await base44.functions.invoke('sendEmail', { draft_id: d.id, test_mode: false }); qc.invalidateQueries({ queryKey: ['project-drafts', id] }); toast.success('Sent!'); }} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">Send</Button>
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

            <TabsContent value="analytics" className="flex-1 p-6 mt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total', value: stats.total, color: 'text-foreground' },
                  { label: 'Email Ready', value: stats.email_ready, color: 'text-blue-600' },
                  { label: 'Contacted', value: stats.contacted, color: 'text-green-600' },
                  { label: 'Qualified', value: stats.qualified, color: 'text-purple-600' },
                  { label: 'Replied', value: stats.replied, color: 'text-emerald-600' },
                  { label: 'Follow-up', value: stats.follow_up || 0, color: 'text-amber-600' },
                  { label: 'Not Interested', value: stats.not_interested, color: 'text-red-500' },
                  { label: 'Drafts Ready', value: approvedDrafts, color: 'text-indigo-600' },
                ].map(({ label, value, color }) => (
                  <Card key={label} className="border-border/60">
                    <CardContent className="py-3 px-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-border/60">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Stage Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={stageChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={10}>
                          {stageChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Channel Readiness</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={channelData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Right sidebar - AI actions */}
        <aside className="w-52 flex-shrink-0 border-l border-border p-4 overflow-y-auto space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bulk AI Actions</p>
            {[
              { ch: 'email', label: 'Email Drafts', icon: Mail, color: 'text-blue-600 border-blue-200 hover:bg-blue-50' },
              { ch: 'linkedin', label: 'LinkedIn Drafts', icon: Linkedin, color: 'text-sky-600 border-sky-200 hover:bg-sky-50' },
              { ch: 'phone', label: 'Call Scripts', icon: Phone, color: 'text-purple-600 border-purple-200 hover:bg-purple-50' },
              { ch: null, label: 'All Channels', icon: Zap, color: 'text-primary border-primary/30 hover:bg-primary/5' },
            ].map(({ ch, label, icon: Icon, color }) => (
              <Button key={label} size="sm" variant="outline" className={cn('w-full justify-start gap-2 h-8 text-xs mb-1.5', color)} onClick={() => handleBulkGenerate(ch)} disabled={bulkGenerating !== null}>
                {bulkGenerating === (ch || 'all') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                {label}
              </Button>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approvals</p>
            <Button size="sm" className="w-full justify-start gap-2 h-8 text-xs" onClick={handleBulkApprove}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve All Drafts
            </Button>
            {pendingDrafts > 0 && <p className="text-xs text-amber-600 mt-1">{pendingDrafts} pending</p>}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Campaign Metrics</p>
            <div className="space-y-2">
              {[
                { label: 'Contact Rate', value: stats.total ? `${Math.round(stats.contacted / stats.total * 100)}%` : '0%' },
                { label: 'Reply Rate', value: stats.contacted ? `${Math.round(stats.replied / stats.contacted * 100)}%` : '0%' },
                { label: 'Qualify Rate', value: stats.contacted ? `${Math.round(stats.qualified / stats.contacted * 100)}%` : '0%' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-bold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Project Actions</p>
            <Link to={`/outreach?project=${id}`}>
              <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs mb-1.5">
                <Send className="w-3.5 h-3.5" /> Campaign Queue
              </Button>
            </Link>
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleProjectStatusChange('archived')}>
              <Archive className="w-3.5 h-3.5" /> Archive Project
            </Button>
          </div>
        </aside>
      </div>

      <AddCompaniesModal open={showAddModal} onClose={() => setShowAddModal(false)} projectId={id} onAdded={() => { qc.invalidateQueries({ queryKey: ['project-companies', id] }); qc.invalidateQueries({ queryKey: ['project', id] }); }} />
    </div>
  );
}