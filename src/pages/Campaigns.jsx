import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban, Plus, Search, X, ChevronRight, Play, Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  draft:     { color: 'bg-gray-100 text-gray-600',   label: 'Draft' },
  active:    { color: 'bg-green-100 text-green-700', label: 'Active' },
  paused:    { color: 'bg-amber-100 text-amber-700', label: 'Paused' },
  completed: { color: 'bg-blue-100 text-blue-700',   label: 'Completed' },
  archived:  { color: 'bg-gray-100 text-gray-400',   label: 'Archived' },
};

function CreateCampaignModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ project_name: '', description: '' });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.project_name.trim()) return;
    setLoading(true);
    const project = await base44.entities.Project.create({ ...form, status: 'draft', campaign_type: 'email' });
    toast.success('Campaign created');
    onCreated(project);
    onClose();
    setForm({ project_name: '', description: '' });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Campaign Name *</Label>
            <Input
              value={form.project_name}
              onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
              placeholder="e.g. IT Sector Q2 Outreach"
              className="mt-1"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 text-sm resize-none"
              placeholder="Who is this campaign targeting and why?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !form.project_name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.Project.list('-created_date', 200),
  });

  const { data: projectCompanies = [] } = useQuery({
    queryKey: ['project-companies-all'],
    queryFn: () => base44.entities.ProjectCompany.list('-created_date', 5000),
  });

  const filtered = projects.filter(p =>
    !search || p.project_name?.toLowerCase().includes(search.toLowerCase())
  ).filter(p => p.status !== 'archived');

  const getCompanyCount = (projectId) => projectCompanies.filter(pc => pc.project_id === projectId).length;

  const handleArchive = async (project) => {
    await base44.entities.Project.update(project.id, { status: 'archived' });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    toast.success('Campaign archived');
  };

  const handleStatusChange = async (project, status) => {
    await base44.entities.Project.update(project.id, { status });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} campaigns</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search campaigns..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border flex-1 flex items-center justify-center">
          <CardContent className="py-16 text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">No campaigns yet</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Create a campaign to start organizing your outreach</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>Create First Campaign</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => {
            const sc = STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
            const companyCount = getCompanyCount(project.id);

            return (
              <Card key={project.id} className="border-border/60 hover:shadow-md transition-all group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <Link to={`/campaigns/${project.id}`} className="font-bold text-base hover:text-primary transition-colors line-clamp-1">
                        {project.project_name}
                      </Link>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <Badge className={cn('ml-2 flex-shrink-0 text-xs', sc.color)}>{sc.label}</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 my-3">
                    {[
                      { label: 'Companies', value: companyCount, color: 'text-foreground' },
                      { label: 'Contacted', value: project.contacted_count || 0, color: 'text-green-600' },
                      { label: 'Replied', value: project.replied_count || 0, color: 'text-blue-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      {project.created_date ? formatDistanceToNow(new Date(project.created_date), { addSuffix: true }) : ''}
                    </span>
                    <div className="flex gap-1">
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
                      <Link to={`/campaigns/${project.id}`}>
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

      <CreateCampaignModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['campaigns'] })}
      />
    </div>
  );
}