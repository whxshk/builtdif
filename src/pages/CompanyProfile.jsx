import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Mail, Phone, Linkedin, Globe, Building2, ArrowLeft,
  CheckCircle2, AlertTriangle, Copy, Send, Clock, FileText, Edit2, Zap, Plus, ExternalLink, Loader2, X, Check,
  MessageCircle, Save
} from 'lucide-react';
import AICopilot from '@/components/AICopilot';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function EditContactModal({ company, open, onClose, onSaved }) {
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFields({
        primary_email:  company.primary_email  || '',
        primary_phone:  company.primary_phone  || '',
        whatsapp:       company.whatsapp       || '',
        linkedin_url:   company.linkedin_url   || '',
        website:        company.website        || '',
        contact_person: company.contact_person || '',
        contact_title:  company.contact_title  || '',
        contact_email:  company.contact_email  || '',
        contact_phone:  company.contact_phone  || '',
      });
    }
  }, [open, company]);

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const cleaned = {};
    for (const [k, v] of Object.entries(fields)) {
      cleaned[k] = v.trim() || null;
    }
    const hasChannel = cleaned.primary_email || cleaned.primary_phone || cleaned.whatsapp || cleaned.linkedin_url;
    cleaned.enrichment_status = hasChannel ? (
      cleaned.primary_email && (cleaned.linkedin_url || cleaned.primary_phone || cleaned.whatsapp) ? 'complete' : 'partial'
    ) : 'needs_enrichment';
    await base44.entities.Company.update(company.id, cleaned);
    toast.success('Contact info saved');
    onSaved();
    onClose();
    setSaving(false);
  };

  const Field = ({ label, k, type = 'text', placeholder }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type={type} value={fields[k] || ''} onChange={e => set(k, e.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Contact Info</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Channels</p>
          <Field label="Primary Email" k="primary_email" type="email" placeholder="email@company.com" />
          <Field label="Primary Phone" k="primary_phone" placeholder="+973 1234 5678" />
          <Field label="WhatsApp" k="whatsapp" placeholder="+973 1234 5678" />
          <Field label="LinkedIn URL" k="linkedin_url" placeholder="https://linkedin.com/company/..." />
          <Field label="Website" k="website" placeholder="https://company.com" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Contact Person</p>
          <Field label="Name" k="contact_person" placeholder="John Smith" />
          <Field label="Title" k="contact_title" placeholder="CEO / Head of Procurement" />
          <Field label="Contact Email" k="contact_email" type="email" placeholder="john@company.com" />
          <Field label="Contact Phone" k="contact_phone" placeholder="+973 1234 5678" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };
const CHANNEL_COLORS = {
  email: 'text-blue-600 bg-blue-100',
  linkedin: 'text-sky-600 bg-sky-100',
  phone: 'text-purple-600 bg-purple-100',
};

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  skipped: 'bg-gray-100 text-gray-400',
};

function DraftCard({ draft, company, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body || '');
  const [subject, setSubject] = useState(draft.subject || '');
  const [loading, setLoading] = useState(false);
  const [callStatus, setCallStatus] = useState('');

  const Icon = CHANNEL_ICONS[draft.channel] || FileText;

  const handleApprove = async () => {
    setLoading(true);
    await base44.functions.invoke('approveDraft', { draft_id: draft.id, action: 'approve' });
    toast.success('Draft approved');
    onRefresh();
    setLoading(false);
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    await base44.functions.invoke('approveDraft', { draft_id: draft.id, action: 'edit', updated_body: body, updated_subject: subject });
    toast.success('Draft updated');
    setEditing(false);
    onRefresh();
    setLoading(false);
  };

  const handleSendEmail = async () => {
    setLoading(true);
    await base44.functions.invoke('sendEmail', { draft_id: draft.id, test_mode: false });
    toast.success('Email sent!');
    onRefresh();
    setLoading(false);
  };

  const handleCopyLinkedIn = async () => {
    await navigator.clipboard.writeText(draft.body || '');
    toast.success('Copied to clipboard!');
    await base44.functions.invoke('logOutreach', {
      company_id: company.id,
      channel: 'linkedin',
      action: 'message_copied',
      status: 'copied',
      draft_id: draft.id,
    });
    onRefresh();
  };

  const handleLogCall = async () => {
    if (!callStatus) return;
    setLoading(true);
    await base44.functions.invoke('logOutreach', {
      company_id: company.id,
      channel: 'phone',
      action: 'call_logged',
      status: callStatus,
      draft_id: draft.id,
    });
    toast.success('Call logged');
    setCallStatus('');
    onRefresh();
    setLoading(false);
  };

  const handleSkip = async () => {
    setLoading(true);
    await base44.functions.invoke('approveDraft', { draft_id: draft.id, action: 'skip' });
    toast.success('Draft skipped');
    onRefresh();
    setLoading(false);
  };

  return (
    <Card className={cn('border-border/60', draft.status === 'sent' && 'opacity-60')}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded flex items-center justify-center ${CHANNEL_COLORS[draft.channel]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{draft.draft_type?.replace(/_/g, ' ')}</span>
          <Badge className={cn('ml-auto text-xs', STATUS_COLORS[draft.status])}>{draft.status}</Badge>
        </div>
        {draft.subject && !editing && (
          <p className="text-sm font-semibold mt-2">{draft.subject}</p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {editing ? (
          <div className="space-y-2">
            {draft.subject !== undefined && draft.channel === 'email' && (
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className="text-sm" />
            )}
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={8} className="text-sm font-mono resize-none" />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSaveEdit} disabled={loading} className="h-7 text-xs">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" />Save</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">Cancel</Button>
            </div>
          </div>
        ) : (
          <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto">{draft.body}</pre>
        )}

        {/* Actions */}
        {draft.status !== 'sent' && draft.status !== 'skipped' && !editing && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 text-xs gap-1">
              <Edit2 className="w-3 h-3" /> Edit
            </Button>
            {draft.status === 'draft' && (
              <Button size="sm" onClick={handleApprove} disabled={loading} className="h-7 text-xs gap-1">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3 h-3" />Approve</>}
              </Button>
            )}
            {draft.status === 'approved' && draft.channel === 'email' && (
              <Button size="sm" onClick={handleSendEmail} disabled={loading} className="h-7 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white" title="Test mode: email is simulated, not actually sent">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3 h-3" />Simulate (test)</>}
              </Button>
            )}
            {draft.channel === 'linkedin' && draft.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={handleCopyLinkedIn} className="h-7 text-xs gap-1 text-sky-600 border-sky-300">
                <Copy className="w-3 h-3" /> Copy Message
              </Button>
            )}
            {draft.channel === 'phone' && (
              <div className="flex gap-2 items-center">
                <Select value={callStatus} onValueChange={setCallStatus}>
                  <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Log call..." /></SelectTrigger>
                  <SelectContent>
                    {['no_answer','answered','interested','not_interested','follow_up_later','wrong_number'].map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {callStatus && (
                  <Button size="sm" onClick={handleLogCall} disabled={loading} className="h-7 text-xs">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log'}
                  </Button>
                )}
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={handleSkip} disabled={loading} className="h-7 text-xs text-muted-foreground gap-1">
              <X className="w-3 h-3" /> Skip
            </Button>
          </div>
        )}
        {draft.sent_at && (
          <p className="text-xs text-muted-foreground mt-2">Sent {format(new Date(draft.sent_at), 'MMM d, yyyy HH:mm')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CompanyProfile() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [generatingChannel, setGeneratingChannel] = useState(null);
  const [activeTab, setActiveTab] = useState('drafts');
  const [editContactOpen, setEditContactOpen] = useState(false);

  const { data: company, isLoading: loadingCo } = useQuery({
    queryKey: ['company', id],
    queryFn: () => base44.entities.Company.get(id),
  });

  const { data: drafts = [], isLoading: loadingDrafts } = useQuery({
    queryKey: ['drafts', id],
    queryFn: () => base44.entities.OutreachDraft.filter({ company_id: id }, '-created_date', 100),
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['logs', id],
    queryFn: () => base44.entities.OutreachLog.filter({ company_id: id }, '-created_date', 100),
  });

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['notes', id],
    queryFn: () => base44.entities.Note.filter({ company_id: id }, '-created_date', 100),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['company', id] });
    qc.invalidateQueries({ queryKey: ['drafts', id] });
    qc.invalidateQueries({ queryKey: ['logs', id] });
    qc.invalidateQueries({ queryKey: ['notes', id] });
  };

  const handleGenerate = async (channel) => {
    setGeneratingChannel(channel);
    try {
      await base44.functions.invoke('generateOutreach', { company_id: id, channel });
      toast.success(`${channel} drafts generated`);
      refresh();
    } catch (err) {
      toast.error('Generation failed');
    }
    setGeneratingChannel(null);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await base44.entities.Note.create({ company_id: id, company_name: company?.company_name, note: noteText, note_type: noteType });
    setNoteText('');
    refresh();
    toast.success('Note added');
  };

  const handleMarkContacted = async () => {
    await base44.entities.Company.update(id, { outreach_status: 'contacted', last_contacted_at: new Date().toISOString() });
    refresh();
    toast.success('Marked as contacted');
  };

  const handleSetFollowUp = async (date) => {
    await base44.entities.Company.update(id, { next_follow_up_at: date, outreach_status: 'in_progress' });
    refresh();
    toast.success('Follow-up scheduled');
  };

  if (loadingCo) {
    return <div className="p-8"><Skeleton className="h-48 w-full" /></div>;
  }
  if (!company) {
    return <div className="p-8 text-center text-muted-foreground">Company not found</div>;
  }

  const hasEmail = !!company.primary_email;
  const hasLinkedIn = !!company.linkedin_url;
  const hasPhone = !!company.primary_phone;
  const hasWhatsApp = !!company.whatsapp;
  const channels = [hasEmail && 'email', hasLinkedIn && 'linkedin', (hasPhone || hasWhatsApp) && 'phone'].filter(Boolean);

  const emailDrafts = drafts.filter(d => d.channel === 'email');
  const linkedinDrafts = drafts.filter(d => d.channel === 'linkedin');
  const phoneDrafts = drafts.filter(d => d.channel === 'phone');

  return (
    <div className="min-h-full bg-background">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-3 bg-card">
        <Link to="/companies">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Companies
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-sm">{company.company_name}</span>
      </div>

      <div className="flex min-h-[calc(100vh-57px)]">
        {/* Left Panel - Company Info */}
        <aside className="w-72 flex-shrink-0 border-r border-border p-5 space-y-5 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-bold text-base leading-tight">{company.company_name}</h2>
            </div>
            {company.cr_number && (
              <p className="text-xs font-mono text-muted-foreground">CR #{company.cr_number}</p>
            )}
          </div>

          {/* Outreach Channels */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outreach Channels</p>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => setEditContactOpen(true)}>
                <Edit2 className="w-3 h-3 mr-1" /> Edit
              </Button>
            </div>
            <div className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs', hasEmail ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground')}>
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{hasEmail ? company.primary_email : 'No email'}</span>
            </div>
            <div className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs', hasPhone ? 'bg-purple-50 text-purple-700' : 'bg-muted text-muted-foreground')}>
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              {hasPhone ? company.primary_phone : 'No phone'}
            </div>
            {hasWhatsApp && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs bg-green-50 text-green-700">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <a href={`https://wa.me/${company.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                  WA: {company.whatsapp}
                </a>
              </div>
            )}
            <div className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs', hasLinkedIn ? 'bg-sky-50 text-sky-700' : 'bg-muted text-muted-foreground')}>
              <Linkedin className="w-3.5 h-3.5 flex-shrink-0" />
              {hasLinkedIn ? (
                <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex items-center gap-1">
                  LinkedIn <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : 'No LinkedIn'}
            </div>
            {company.contact_person && (
              <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md text-xs bg-muted/50">
                <span className="text-muted-foreground shrink-0">Contact:</span>
                <span className="font-medium truncate">{company.contact_person}{company.contact_title ? ` · ${company.contact_title}` : ''}</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
            {[
              { label: 'Category', value: company.category },
              { label: 'Source', value: company.source },
              { label: 'Enrichment', value: company.enrichment_status?.replace(/_/g, ' ') },
              { label: 'Outreach', value: company.outreach_status?.replace(/_/g, ' ') },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{label}</span>
                <span className="text-xs font-medium text-foreground">{value || '—'}</span>
              </div>
            ))}
            {company.website && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Website</span>
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                  <Globe className="w-3 h-3 flex-shrink-0" /> {company.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            {company.last_enriched && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Enriched</span>
                <span className="text-xs">{company.last_enriched}</span>
              </div>
            )}
            {company.last_contacted_at && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Last contact</span>
                <span className="text-xs">{formatDistanceToNow(new Date(company.last_contacted_at), { addSuffix: true })}</span>
              </div>
            )}
          </div>

          {!hasEmail && !hasPhone && !hasLinkedIn && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs Enrichment
              </div>
              <p className="text-xs text-amber-600 mt-1">No contact channels available</p>
            </div>
          )}
        </aside>

        {/* Main Panel */}
        <main className="flex-1 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="drafts" className="text-sm">
                Drafts {drafts.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{drafts.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-sm">
                Activity {logs.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{logs.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-sm">
                Notes {notes.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{notes.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Drafts Tab */}
            <TabsContent value="drafts" className="space-y-4 mt-0">
              {/* Generate buttons */}
              <div className="flex flex-wrap gap-2">
                {channels.map(channel => {
                  const CIcon = CHANNEL_ICONS[channel];
                  return (
                    <Button
                      key={channel}
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerate(channel)}
                      disabled={generatingChannel === channel}
                      className={cn('gap-2 text-xs', channel === 'email' && 'border-blue-300 text-blue-700 hover:bg-blue-50', channel === 'linkedin' && 'border-sky-300 text-sky-700 hover:bg-sky-50', channel === 'phone' && 'border-purple-300 text-purple-700 hover:bg-purple-50')}
                    >
                      {generatingChannel === channel
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <><Zap className="w-3.5 h-3.5" />{generatingChannel === null ? `Generate ${channel} drafts` : `Generate ${channel}`}</>
                      }
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => handleGenerate(null)} disabled={generatingChannel !== null} className="gap-2 text-xs">
                  {generatingChannel !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Zap className="w-3.5 h-3.5" />Generate All</>}
                </Button>
              </div>

              {loadingDrafts ? (
                <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No drafts yet. Click Generate to create outreach drafts.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emailDrafts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        <Mail className="w-3.5 h-3.5" /> Email Drafts
                      </div>
                      <div className="space-y-2">
                        {emailDrafts.map(d => <DraftCard key={d.id} draft={d} company={company} onRefresh={refresh} />)}
                      </div>
                    </div>
                  )}
                  {linkedinDrafts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-sky-700 uppercase tracking-wide">
                        <Linkedin className="w-3.5 h-3.5" /> LinkedIn Drafts
                      </div>
                      <div className="space-y-2">
                        {linkedinDrafts.map(d => <DraftCard key={d.id} draft={d} company={company} onRefresh={refresh} />)}
                      </div>
                    </div>
                  )}
                  {phoneDrafts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-700 uppercase tracking-wide">
                        <Phone className="w-3.5 h-3.5" /> Phone Scripts
                      </div>
                      <div className="space-y-2">
                        {phoneDrafts.map(d => <DraftCard key={d.id} draft={d} company={company} onRefresh={refresh} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="mt-0">
              {loadingLogs ? (
                <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => {
                    const LogIcon = CHANNEL_ICONS[log.channel] || FileText;
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 bg-card border border-border/40 rounded-lg">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${CHANNEL_COLORS[log.channel]}`}>
                          <LogIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{log.action?.replace(/_/g, ' ')}</span>
                            <Badge variant="outline" className="text-xs">{log.status}</Badge>
                          </div>
                          {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {log.created_date ? formatDistanceToNow(new Date(log.created_date), { addSuffix: true }) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="mt-0 space-y-4">
              <Card className="border-border/60">
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex gap-2">
                    <Select value={noteType} onValueChange={setNoteType}>
                      <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['general','call','email','linkedin','follow_up'].map(t => (
                          <SelectItem key={t} value={t} className="text-xs">{t.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    placeholder="Add a note about this company..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                  <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim()} className="h-8 text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add Note
                  </Button>
                </CardContent>
              </Card>
              {loadingNotes ? (
                <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No notes yet</div>
              ) : (
                <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className="p-3 bg-card border border-border/40 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{note.note_type}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {note.created_date ? formatDistanceToNow(new Date(note.created_date), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>

        {/* Right Sidebar - Quick Actions */}
        <aside className="w-56 flex-shrink-0 border-l border-border p-4 space-y-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Actions</p>

          <Button size="sm" className="w-full justify-start gap-2 h-8 text-xs" onClick={handleMarkContacted}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Contacted
          </Button>

          {hasEmail && (
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-blue-600 border-blue-200" onClick={() => { setActiveTab('drafts'); handleGenerate('email'); }}>
              <Mail className="w-3.5 h-3.5" /> Generate Email
            </Button>
          )}
          {hasLinkedIn && (
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-sky-600 border-sky-200" onClick={() => { setActiveTab('drafts'); handleGenerate('linkedin'); }}>
              <Linkedin className="w-3.5 h-3.5" /> Generate LinkedIn
            </Button>
          )}
          {hasPhone && (
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs text-purple-600 border-purple-200" onClick={() => { setActiveTab('drafts'); handleGenerate('phone'); }}>
              <Phone className="w-3.5 h-3.5" /> Generate Call Script
            </Button>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Follow-up</p>
            <Input
              type="date"
              className="h-8 text-xs"
              min={new Date().toISOString().split('T')[0]}
              onChange={e => e.target.value && handleSetFollowUp(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-border">
            <Button size="sm" variant="outline" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setEditContactOpen(true)}>
              <Edit2 className="w-3.5 h-3.5" /> Edit Contact Info
            </Button>
          </div>

          <div className="pt-2 border-t border-border">
            <AICopilot companyId={id} className="mb-3" />
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Update Status</p>
            <Select
              value={company.outreach_status}
              onValueChange={async (v) => {
                await base44.entities.Company.update(id, { outreach_status: v });
                refresh();
              }}
            >
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['not_started','in_progress','contacted','responded','qualified','not_interested','skipped'].map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </aside>
      </div>

      <EditContactModal
        company={company}
        open={editContactOpen}
        onClose={() => setEditContactOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}