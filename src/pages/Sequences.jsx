import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  GitBranch, Plus, Mail, Linkedin, Phone, CheckSquare, Trash2, Play, Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone, task: CheckSquare };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100 border-blue-200',
  linkedin: 'text-sky-600 bg-sky-100 border-sky-200',
  phone: 'text-purple-600 bg-purple-100 border-purple-200',
  task: 'text-amber-600 bg-amber-100 border-amber-200',
};

const ACTION_TYPES = {
  email: ['send_email', 'follow_up'],
  linkedin: ['connection_request', 'linkedin_message', 'follow_up'],
  phone: ['follow_up', 'task_reminder'],
  task: ['task_reminder', 'follow_up'],
};

function StepCard({ step, index, onDelete }) {
  const Icon = CHANNEL_ICONS[step.channel] || Mail;
  return (
    <div className="relative">
      {index > 0 && (
        <div className="flex justify-center -mt-1 mb-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-border" />
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">+{step.delay_days}d</span>
            <div className="w-px h-4 bg-border" />
          </div>
        </div>
      )}
      <Card className={cn('border', CHANNEL_COLORS[step.channel])}>
        <CardContent className="p-3 flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', CHANNEL_COLORS[step.channel])}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold capitalize">{step.action_type?.replace(/_/g, ' ')}</p>
            <p className="text-xs text-muted-foreground capitalize">{step.channel} · Day {step.delay_days}</p>
            {step.subject && <p className="text-xs text-muted-foreground truncate">{step.subject}</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => onDelete(step.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SequenceBuilder({ sequence, steps, onAddStep, onDeleteStep }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newStep, setNewStep] = useState({ channel: 'email', action_type: 'send_email', delay_days: 0, subject: '', body: '' });

  const handleAdd = async () => {
    if (!sequence) return;
    await onAddStep({ ...newStep, sequence_id: sequence.id, step_number: steps.length + 1, delay_days: Number(newStep.delay_days) });
    setShowAdd(false);
    setNewStep({ channel: 'email', action_type: 'send_email', delay_days: 0, subject: '', body: '' });
  };

  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <StepCard key={step.id} step={step} index={i} onDelete={onDeleteStep} />
      ))}
      {showAdd ? (
        <div className="mt-3 border border-dashed border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Step</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={newStep.channel} onValueChange={v => setNewStep(s => ({ ...s, channel: v, action_type: ACTION_TYPES[v]?.[0] || 'follow_up' }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email', 'linkedin', 'phone', 'task'].map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Action</Label>
              <Select value={newStep.action_type} onValueChange={v => setNewStep(s => ({ ...s, action_type: v }))}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(ACTION_TYPES[newStep.channel] || []).map(a => <SelectItem key={a} value={a} className="text-xs">{a.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Delay (days)</Label>
              <Input type="number" min="0" value={newStep.delay_days} onChange={e => setNewStep(s => ({ ...s, delay_days: e.target.value }))} className="mt-1 h-8 text-xs" />
            </div>
          </div>
          {newStep.channel === 'email' && (
            <Input value={newStep.subject} onChange={e => setNewStep(s => ({ ...s, subject: e.target.value }))} placeholder="Email subject..." className="h-8 text-xs" />
          )}
          <Textarea value={newStep.body} onChange={e => setNewStep(s => ({ ...s, body: e.target.value }))} rows={3} className="text-xs resize-none" placeholder="Message body (optional)..." />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} className="h-7 text-xs">Add Step</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center mt-3">
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1.5 text-xs border-dashed">
            <Plus className="w-3.5 h-3.5" /> Add Step
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Sequences() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => base44.entities.Sequence.list('-created_date', 100),
  });

  const { data: allSteps = [] } = useQuery({
    queryKey: ['sequence-steps'],
    queryFn: () => base44.entities.SequenceStep.list('step_number', 500),
  });

  const selected = sequences.find(s => s.id === selectedId);
  const selectedSteps = allSteps.filter(s => s.sequence_id === selectedId).sort((a, b) => a.step_number - b.step_number);

  const handleCreate = async () => {
    if (!form.name) return;
    setLoading(true);
    const seq = await base44.entities.Sequence.create({ ...form, status: 'draft' });
    qc.invalidateQueries({ queryKey: ['sequences'] });
    setSelectedId(seq.id);
    setShowCreate(false);
    setForm({ name: '', description: '' });
    toast.success('Sequence created');
    setLoading(false);
  };

  const handleAddStep = async (stepData) => {
    await base44.entities.SequenceStep.create(stepData);
    qc.invalidateQueries({ queryKey: ['sequence-steps'] });
    toast.success('Step added');
  };

  const handleDeleteStep = async (stepId) => {
    await base44.entities.SequenceStep.delete(stepId);
    qc.invalidateQueries({ queryKey: ['sequence-steps'] });
  };

  const handleStatusToggle = async (seq) => {
    const next = seq.status === 'active' ? 'paused' : 'active';
    await base44.entities.Sequence.update(seq.id, { status: next });
    qc.invalidateQueries({ queryKey: ['sequences'] });
  };

  return (
    <div className="flex h-full">
      {/* Left: Sequence list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-bold">Sequences</h2>
            <p className="text-xs text-muted-foreground">{sequences.length} sequences</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : sequences.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm px-4">
              <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No sequences yet
            </div>
          ) : (
            sequences.map(seq => {
              const stepsForSeq = allSteps.filter(s => s.sequence_id === seq.id);
              return (
                <button
                  key={seq.id}
                  onClick={() => setSelectedId(seq.id)}
                  className={cn('w-full text-left px-4 py-3.5 border-b border-border/40 hover:bg-muted/30 transition-colors',
                    selectedId === seq.id && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold truncate">{seq.name}</p>
                    <Badge className={cn('text-[10px] ml-2 flex-shrink-0',
                      seq.status === 'active' ? 'bg-green-100 text-green-700' :
                      seq.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    )}>{seq.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{stepsForSeq.length} steps</p>
                  {seq.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{seq.description}</p>}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Builder */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <GitBranch className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Select or create a sequence</p>
            <p className="text-sm mt-1">Build multi-step outreach flows with email, LinkedIn, and phone</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>Create Sequence</Button>
          </div>
        ) : (
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg">{selected.name}</h2>
                {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleStatusToggle(selected)} className={cn('gap-1.5 h-8 text-xs',
                  selected.status === 'active' ? 'border-amber-300 text-amber-700' : 'border-green-300 text-green-700'
                )}>
                  {selected.status === 'active' ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Activate</>}
                </Button>
              </div>
            </div>

            {selectedSteps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-dashed border-border mb-4">
                No steps yet. Add your first step below.
              </div>
            ) : null}

            <SequenceBuilder
              sequence={selected}
              steps={selectedSteps}
              onAddStep={handleAddStep}
              onDeleteStep={handleDeleteStep}
            />

            {selectedSteps.length > 0 && (
              <div className="mt-6 p-4 bg-muted/30 rounded-xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sequence Summary</p>
                <p className="text-sm"><span className="font-bold">{selectedSteps.length}</span> steps · <span className="font-bold">{selectedSteps[selectedSteps.length - 1]?.delay_days || 0}</span> day total duration</p>
                <div className="flex gap-1.5 mt-2">
                  {['email','linkedin','phone','task'].map(ch => {
                    const count = selectedSteps.filter(s => s.channel === ch).length;
                    if (!count) return null;
                    const Icon = CHANNEL_ICONS[ch];
                    return (
                      <Badge key={ch} variant="outline" className={cn('text-xs gap-1', CHANNEL_COLORS[ch])}>
                        <Icon className="w-3 h-3" />{count} {ch}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Sequence</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Sequence Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="e.g. IT Sector Cold Outreach" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="mt-1 text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading || !form.name}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}