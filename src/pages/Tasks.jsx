import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import {
  CheckSquare, Plus, X, CheckCircle2, AlertTriangle,
  Mail, Phone, Linkedin, Calendar, Building2
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
import { format, isPast, isToday } from 'date-fns';

const TYPE_CONFIG = {
  follow_up_email:       { icon: Mail,        color: 'text-blue-600',   label: 'Follow-up Email' },
  linkedin_follow_up:    { icon: Linkedin,     color: 'text-sky-600',    label: 'LinkedIn Follow-up' },
  call_reminder:         { icon: Phone,        color: 'text-purple-600', label: 'Call Reminder' },
  enrichment_reminder:   { icon: Building2,    color: 'text-amber-600',  label: 'Enrichment' },
  general:               { icon: CheckSquare,  color: 'text-gray-600',   label: 'General' },
};

function CreateTaskModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', company_id: '', company_name: '', task_type: 'general', notes: '', due_date: '', assigned_to: '' });
  const [loading, setLoading] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-for-tasks'],
    queryFn: () => base44.entities.Company.list('-created_date', 1000),
    enabled: open,
  });

  const handleCreate = async () => {
    if (!form.title || !form.company_id) return;
    setLoading(true);
    await base44.entities.Task.create(form);
    toast.success('Task created');
    onCreated();
    onClose();
    setForm({ title: '', company_id: '', company_name: '', task_type: 'general', notes: '', due_date: '', assigned_to: '' });
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1" placeholder="Task title..." />
          </div>
          <div>
            <Label className="text-xs">Company *</Label>
            <Select value={form.company_id} onValueChange={v => {
              const c = companies.find(c => c.id === v);
              setForm(f => ({ ...f, company_id: v, company_name: c?.company_name || '' }));
            }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select company..." /></SelectTrigger>
              <SelectContent>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.task_type} onValueChange={v => setForm(f => ({ ...f, task_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 text-sm resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !form.title || !form.company_id}>Create Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Tasks() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  // Auto-mark overdue
  const enriched = tasks.map(t => {
    if (t.status === 'pending' && t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))) {
      return { ...t, status: 'overdue' };
    }
    return t;
  });

  const filtered = enriched.filter(t => statusFilter === 'all' || t.status === statusFilter);

  const handleComplete = async (task) => {
    await base44.entities.Task.update(task.id, { status: 'completed' });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    toast.success('Task completed');
  };

  const handleDelete = async (id) => {
    await base44.entities.Task.delete(id);
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const counts = {
    all: enriched.length,
    pending: enriched.filter(t => t.status === 'pending').length,
    overdue: enriched.filter(t => t.status === 'overdue').length,
    completed: enriched.filter(t => t.status === 'completed').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Follow-up and outreach task management</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      {counts.overdue > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700 font-medium">{counts.overdue} overdue task{counts.overdue !== 1 ? 's' : ''}</span>
          <button className="ml-auto text-xs text-red-500 hover:underline" onClick={() => setStatusFilter('overdue')}>View overdue</button>
        </div>
      )}

      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit mb-5">
        {[
          { value: 'pending', label: `Pending (${counts.pending})` },
          { value: 'overdue', label: `Overdue (${counts.overdue})` },
          { value: 'completed', label: `Completed (${counts.completed})` },
          { value: 'all', label: `All (${counts.all})` },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => setStatusFilter(value)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              statusFilter === value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              value === 'overdue' && counts.overdue > 0 && statusFilter !== 'overdue' && 'text-red-500'
            )}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-12 text-center">
            <CheckSquare className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No tasks in this view</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const tc = TYPE_CONFIG[task.task_type] || TYPE_CONFIG.general;
            const Icon = tc.icon;
            const isOverdue = task.status === 'overdue';
            const isDueToday = task.due_date && isToday(new Date(task.due_date));

            return (
              <Card key={task.id} className={cn('border-border/60 hover:shadow-sm transition-shadow', isOverdue && 'border-red-200', task.status === 'completed' && 'opacity-60')}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <button onClick={() => task.status !== 'completed' && handleComplete(task)} className={cn('mt-0.5 flex-shrink-0', task.status === 'completed' ? 'text-green-500' : 'text-muted-foreground hover:text-green-500 transition-colors')}>
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn('font-medium text-sm', task.status === 'completed' && 'line-through text-muted-foreground')}>{task.title}</p>
                        <Badge className={cn('text-xs', tc.color.replace('text-', 'bg-').replace('-600', '-100'), tc.color)}>
                          <Icon className="w-3 h-3 mr-1" />{tc.label}
                        </Badge>
                        {task.status === 'overdue' && <Badge className="text-xs bg-red-100 text-red-600">Overdue</Badge>}
                        {isDueToday && task.status !== 'completed' && <Badge className="text-xs bg-amber-100 text-amber-700">Due Today</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <Link to={`/companies/${task.company_id}`} className="text-xs text-primary hover:underline">{task.company_name}</Link>
                        {task.due_date && (
                          <span className={cn('text-xs flex items-center gap-1', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
                            <Calendar className="w-3 h-3" />{format(new Date(task.due_date), 'MMM d, yyyy')}
                          </span>
                        )}
                        {task.notes && <span className="text-xs text-muted-foreground truncate max-w-48">{task.notes}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTaskModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['tasks'] })} />
    </div>
  );
}