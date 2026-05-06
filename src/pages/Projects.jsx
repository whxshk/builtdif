import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import {
  FolderKanban, Plus, Search, ChevronRight, Archive, Play, Pause,
  CheckCircle2, Circle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  draft:     { color: 'bg-gray-100 text-gray-600',    icon: Circle,       label: 'Draft' },
  active:    { color: 'bg-green-100 text-green-700',  icon: Play,         label: 'Active' },
  paused:    { color: 'bg-amber-100 text-amber-700',  icon: Pause,        label: 'Paused' },
  completed: { color: 'bg-blue-100 text-blue-700',    icon: CheckCircle2, label: 'Completed' },
  archived:  { color: 'bg-gray-100 text-gray-400',    icon: Archive,      label: 'Archived' },
};

const TYPE_COLORS = {
  email:         'bg-blue-100 text-blue-700',
  linkedin:      'bg-sky-100 text-sky-700',
  phone:         'bg-purple-100 text-purple-700',
  multi_channel: 'bg-violet-100 text-violet-700',
};

function CreateProjectModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    project_name: '', description: '', campaign_type: 'multi_channel',
    target_category: '', target_region: '', outreach_goal: '', owner: '',
    start_date: '', end_date: '',
  });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.project_name.trim()) return;
    setLoading(true);
    const project = await base44.entities.Project.create({ ...form, status: 'draft' });
    toast.success('Project created');
    onCreated(project);
    onClose();
    setForm({ project_name: '', description: '', campaign_type: 'multi_channel', target_category: '', target_region: '', outreach_goal: '', owner: '', start_date: '', end_date: '' });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Project Name *</Label>
            <Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="e.g. IT & Telecom Q2 Outreach" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="mt-1 text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Campaign Type</Label>
              <Select value={form.campaign_type} onValueChange={v => setForm(f => ({ ...f, campaign_type: v }))}>
                <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['multi_channel','email','linkedin','phone'].map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Owner</Label>
              <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Your name" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Target Category</Label>
              <Input value={form.target_category} onChange={e => setForm(f => ({ ...f, target_category: e.target.value }))} placeholder="e.g. IT & Telecom" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Target Region</Label>
              <Input value={form.target_region} onChange={e => setForm(f => ({ ...f, target_region: e.target.value }))} placeholder="e.g. Qatar" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Outreach Goal</Label>
            <Input value={form.outreach_goal} onChange={e => setForm(f => ({ ...f, outreach_goal: e.target.value }))} placeholder="e.g. Book 20 discovery calls" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !form.project_name.trim()}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date', 200),
  });

  const filtered = projects.filter(p => {
    if (search && !p.project_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const handleArchive = async (project) => {
    await base44.entities.Project.update(project.id, { status: 'archived' });
    qc.invalidateQueries({ queryKey: ['projects'] });
    toast.success('Project archived');
  };

  const handleStatusChange = async (project, status) => {
    await base44.entities.Project.update(project.id, { status });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} campaigns</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search projects..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {['all', 'active', 'draft', 'paused', 'completed', 'archived'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                statusFilter === s ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >{s}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-16 text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">No projects yet</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Create a project to organize your outreach campaigns</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>Create First Project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => {
            const sc = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
            const StatusIcon = sc.icon;
            const completion = project.total_companies > 0
              ? Math.round((project.contacted_count || 0) / project.total_companies * 100)
              : 0;

            return (
              <Card key={project.id} className="border-border/60 hover:shadow-md transition-all group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/projects/${project.id}`} className="font-bold text-base hover:text-primary transition-colors line-clamp-1">
                        {project.project_name}
                      </Link>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <Badge className={cn('ml-2 flex-shrink-0 text-xs gap-1', sc.color)}>
                      <StatusIcon className="w-3 h-3" />{sc.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <Badge className={cn('text-xs', TYPE_COLORS[project.campaign_type] || 'bg-gray-100 text-gray-600')}>
                      {(project.campaign_type || 'multi_channel').replace('_', ' ')}
                    </Badge>
                    {project.target_category && <Badge variant="outline" className="text-xs">{project.target_category}</Badge>}
                    {project.target_region && <Badge variant="outline" className="text-xs">{project.target_region}</Badge>}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Total', value: project.total_companies || 0, color: 'text-foreground' },
                      { label: 'Contacted', value: project.contacted_count || 0, color: 'text-green-600' },
                      { label: 'Replied', value: project.replied_count || 0, color: 'text-blue-600' },
                      { label: 'Progress', value: `${completion}%`, color: 'text-purple-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
                        <p className={`text-base font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-1.5 mb-3">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${completion}%` }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {project.owner && `By ${project.owner} · `}
                      {project.created_date ? formatDistanceToNow(new Date(project.created_date), { addSuffix: true }) : ''}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {project.status === 'draft' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleStatusChange(project, 'active')}>
                          <Play className="w-3 h-3 mr-1" /> Activate
                        </Button>
                      )}
                      {project.status === 'active' && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleStatusChange(project, 'paused')}>
                          <Pause className="w-3 h-3 mr-1" /> Pause
                        </Button>
                      )}
                      <Link to={`/projects/${project.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs">
                          Open <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['projects'] })}
      />
    </div>
  );
}