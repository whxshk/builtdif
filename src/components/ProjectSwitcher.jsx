import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useActiveProject } from '@/lib/ProjectContext';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FolderKanban, ChevronsUpDown, Plus, FolderOpen, Settings, Globe, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ProjectSwitcher() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeProject, activeProjectId, setActiveProjectId, projects } = useActiveProject();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ project_name: '', description: '' });

  const handleCreate = async () => {
    if (!form.project_name.trim()) return;
    setCreating(true);
    const created = await base44.entities.Project.create({
      project_name: form.project_name.trim(),
      description: form.description.trim() || undefined,
      status: 'draft',
    });
    qc.invalidateQueries({ queryKey: ['projects-all'] });
    setActiveProjectId(created.id);
    toast.success(`Project "${created.project_name}" created`);
    setCreating(false);
    setCreateOpen(false);
    setForm({ project_name: '', description: '' });
    navigate('/');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              'bg-sidebar-accent/40 hover:bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-border'
            )}
          >
            <div className={cn(
              'w-7 h-7 rounded flex items-center justify-center flex-shrink-0',
              activeProject ? 'bg-sidebar-primary/20 text-sidebar-primary' : 'bg-sidebar-accent text-sidebar-foreground/50'
            )}>
              {activeProject ? <FolderKanban className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/50 leading-tight">
                {activeProject ? 'Project' : 'Workspace'}
              </p>
              <p className="text-xs font-semibold truncate text-sidebar-foreground">
                {activeProject ? activeProject.project_name : 'No project selected'}
              </p>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-sidebar-foreground/50 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuLabel className="text-xs">Switch Project</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => setActiveProjectId(null)}
            className="gap-2 text-sm"
          >
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1">Global view</span>
            {!activeProjectId && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>

          {projects.length > 0 && <DropdownMenuSeparator />}

          {projects.slice(0, 8).map(p => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => { setActiveProjectId(p.id); navigate('/'); }}
              className="gap-2 text-sm"
            >
              <FolderKanban className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 truncate">{p.project_name}</span>
              {activeProjectId === p.id && <Check className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create New Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/campaigns')} className="gap-2 text-sm">
            <FolderOpen className="w-4 h-4" /> Manage Projects
          </DropdownMenuItem>
          {activeProject && (
            <DropdownMenuItem onClick={() => navigate(`/campaigns/${activeProject.id}`)} className="gap-2 text-sm">
              <Settings className="w-4 h-4" /> Project Settings
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Project Name *</Label>
              <Input
                autoFocus
                placeholder="Q1 Outreach Campaign"
                value={form.project_name}
                onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                placeholder="What is this project about?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The project starts empty. After creating, you can import an Excel sheet or add companies from the global database.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.project_name.trim()} className="gap-1.5">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}