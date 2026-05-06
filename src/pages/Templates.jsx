import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, FileText, Mail, Linkedin, Phone, Edit2, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100',
  linkedin: 'text-sky-600 bg-sky-100',
  phone: 'text-purple-600 bg-purple-100',
};

const VARIABLES = ['{{company_name}}', '{{category}}', '{{website}}', '{{linkedin_url}}', '{{primary_email}}', '{{primary_phone}}'];

function TemplateModal({ open, onClose, template, onSaved }) {
  const [form, setForm] = useState(template || {
    template_name: '', channel: 'email', draft_type: 'first_outreach', subject: '', body: '', is_global: true,
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!form.template_name || !form.body) return;
    setLoading(true);
    if (template?.id) {
      await base44.entities.Template.update(template.id, form);
    } else {
      await base44.entities.Template.create(form);
    }
    toast.success('Template saved');
    onSaved();
    onClose();
    setLoading(false);
  };

  const insertVariable = (v) => setForm(f => ({ ...f, body: f.body + v }));

  const draftTypes = {
    email: ['first_outreach', 'follow_up', 're_engagement'],
    linkedin: ['connection_request', 'linkedin_message', 'follow_up'],
    phone: ['call_script', 'voicemail'],
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Template Name *</Label>
              <Input value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))} className="mt-1" placeholder="e.g. IT Sector First Email" />
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v, draft_type: draftTypes[v]?.[0] || '' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Draft Type</Label>
              <Select value={form.draft_type} onValueChange={v => setForm(f => ({ ...f, draft_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(draftTypes[form.channel] || []).map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.channel === 'email' && (
              <div>
                <Label className="text-xs">Subject Line</Label>
                <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="mt-1" placeholder="Subject line..." />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Body *</Label>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => insertVariable(v)} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary/20 font-mono transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={10} className="font-mono text-xs resize-none" placeholder="Write your template here. Use variables like {{company_name}} for personalization." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !form.template_name || !form.body}>Save Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Templates() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeChannel, setActiveChannel] = useState('all');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list('-created_date', 200),
  });

  const filtered = templates.filter(t => activeChannel === 'all' || t.channel === activeChannel);

  const handleDelete = async (id) => {
    await base44.entities.Template.delete(id);
    qc.invalidateQueries({ queryKey: ['templates'] });
    toast.success('Template deleted');
  };

  const handleDuplicate = async (t) => {
    await base44.entities.Template.create({ ...t, template_name: `${t.template_name} (copy)`, id: undefined });
    qc.invalidateQueries({ queryKey: ['templates'] });
    toast.success('Template duplicated');
  };

  const counts = {
    all: templates.length,
    email: templates.filter(t => t.channel === 'email').length,
    linkedin: templates.filter(t => t.channel === 'linkedin').length,
    phone: templates.filter(t => t.channel === 'phone').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable outreach templates with variable support</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Template
        </Button>
      </div>

      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit mb-6">
        {[
          { value: 'all', label: `All (${counts.all})` },
          { value: 'email', label: `Email (${counts.email})` },
          { value: 'linkedin', label: `LinkedIn (${counts.linkedin})` },
          { value: 'phone', label: `Phone (${counts.phone})` },
        ].map(({ value, label }) => (
          <button key={value} onClick={() => setActiveChannel(value)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              activeChannel === value ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">No templates yet</p>
            <p className="text-sm text-muted-foreground/70 mb-4">Create reusable templates with variables like {'{{company_name}}'}</p>
            <Button size="sm" onClick={() => setShowModal(true)}>Create Template</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(t => {
            const Icon = CHANNEL_ICONS[t.channel] || FileText;
            return (
              <Card key={t.id} className="border-border/60 hover:shadow-md transition-all group">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', CHANNEL_COLORS[t.channel])}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm truncate">{t.template_name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{t.draft_type?.replace(/_/g, ' ')}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {t.subject && <p className="text-xs font-semibold mb-1.5">{t.subject}</p>}
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 font-sans bg-muted/30 rounded p-2">{t.body}</pre>
                  <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setEditing(t); setShowModal(true); }}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleDuplicate(t)}>
                      <Copy className="w-3 h-3" /> Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-red-500 ml-auto" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TemplateModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        template={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ['templates'] })}
      />
    </div>
  );
}