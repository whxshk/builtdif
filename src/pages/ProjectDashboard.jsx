import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useActiveProject } from '@/lib/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Mail, Phone, Linkedin, Send, FileText,
  CheckCircle2, Clock, AlertTriangle, Upload, Settings, ArrowRight, FolderKanban,
} from 'lucide-react';

function StatCard({ label, value, icon: Icon, color, loading, to }) {
  const content = (
    <Card className="border-border/60 hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            {loading ? <Skeleton className="h-7 w-12 mt-1.5" /> : <p className="text-2xl font-bold mt-1">{(value ?? 0).toLocaleString()}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}><Icon className="w-4 h-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

const PROGRESS_STEPS = [
  { key: 'imported',  label: 'Imported',         color: 'bg-slate-500' },
  { key: 'reviewed',  label: 'Reviewed',         color: 'bg-blue-500' },
  { key: 'generated', label: 'Drafts Generated', color: 'bg-indigo-500' },
  { key: 'approved',  label: 'Approved',         color: 'bg-violet-500' },
  { key: 'scheduled', label: 'Scheduled',        color: 'bg-amber-500' },
  { key: 'sent',      label: 'Sent',             color: 'bg-green-500' },
];

export default function ProjectDashboard() {
  const { activeProject, activeProjectId } = useActiveProject();

  const { data: pcs = [], isLoading: loadingPcs } = useQuery({
    queryKey: ['project-companies', activeProjectId],
    queryFn: () => base44.entities.ProjectCompany.filter({ project_id: activeProjectId }, '-created_date', 5000),
    enabled: !!activeProjectId,
  });

  const { data: allCompanies = [], isLoading: loadingCo } = useQuery({
    queryKey: ['companies-stats'],
    queryFn: () => base44.entities.Company.list('-created_date', 5000),
  });

  const { data: drafts = [] } = useQuery({
    queryKey: ['project-drafts', activeProjectId],
    queryFn: () => base44.entities.OutreachDraft.filter({ project_id: activeProjectId }, '-created_date', 2000),
    enabled: !!activeProjectId,
  });

  const { data: scheduled = [] } = useQuery({
    queryKey: ['project-scheduled', activeProjectId],
    queryFn: () => base44.entities.ScheduledOutreach.filter({ project_id: activeProjectId }, '-created_date', 2000),
    enabled: !!activeProjectId,
  });

  const stats = useMemo(() => {
    const companyMap = new Map(allCompanies.map(c => [c.id, c]));
    const companies = pcs.map(pc => companyMap.get(pc.company_id)).filter(Boolean);

    const stageCounts = {};
    for (const pc of pcs) stageCounts[pc.outreach_stage] = (stageCounts[pc.outreach_stage] || 0) + 1;

    const total = pcs.length;
    const reviewedStages = ['generated', 'approved', 'contacted', 'replied', 'qualified', 'follow_up', 'not_interested', 'skipped'];
    const reviewed = pcs.filter(pc => reviewedStages.includes(pc.outreach_stage)).length;

    return {
      total,
      email_ready:     companies.filter(c => c.primary_email).length,
      linkedin_ready:  companies.filter(c => c.linkedin_url).length,
      phone_ready:     companies.filter(c => c.primary_phone).length,
      needs_enrichment: companies.filter(c => c.enrichment_status === 'needs_enrichment' || (!c.primary_email && !c.primary_phone && !c.linkedin_url)).length,
      drafts_generated: drafts.length,
      drafts_approved:  drafts.filter(d => d.status === 'approved' || d.status === 'sent').length,
      scheduled_sends:  scheduled.filter(s => s.status === 'scheduled' || s.status === 'queued').length,
      sent_emails:      scheduled.filter(s => s.status === 'sent').length + drafts.filter(d => d.status === 'sent').length,
      failed_sends:     scheduled.filter(s => s.status === 'failed').length,
      contacted:        (stageCounts.contacted || 0) + (stageCounts.replied || 0) + (stageCounts.qualified || 0),
      replied:          stageCounts.replied || 0,
      // progress
      progress: {
        imported:  total,
        reviewed,
        generated: drafts.length,
        approved:  drafts.filter(d => d.status === 'approved' || d.status === 'sent').length,
        scheduled: scheduled.filter(s => s.status === 'scheduled' || s.status === 'queued' || s.status === 'sent').length,
        sent:      scheduled.filter(s => s.status === 'sent').length + drafts.filter(d => d.status === 'sent').length,
      },
    };
  }, [pcs, allCompanies, drafts, scheduled]);

  if (!activeProject) return null;

  const isEmpty = stats.total === 0;
  const progressMax = Math.max(stats.progress.imported, 1);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <FolderKanban className="w-3 h-3" /> Project Dashboard
            <Badge variant="outline" className="text-[10px] capitalize">{activeProject.status}</Badge>
          </div>
          <h1 className="text-2xl font-bold truncate">{activeProject.project_name}</h1>
          {activeProject.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{activeProject.description}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link to="/import"><Button size="sm" variant="outline" className="gap-1.5"><Upload className="w-3.5 h-3.5" />Import Excel</Button></Link>
          <Link to={`/campaigns/${activeProjectId}`}><Button size="sm" className="gap-1.5"><FolderKanban className="w-3.5 h-3.5" />Open Workspace</Button></Link>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && !loadingPcs && (
        <Card className="border-primary/20 bg-primary/5 mb-6">
          <CardContent className="py-8 text-center">
            <Upload className="w-10 h-10 mx-auto mb-3 text-primary/60" />
            <p className="font-semibold text-foreground mb-1">This project is empty</p>
            <p className="text-sm text-muted-foreground mb-4">Import an Excel sheet or add companies from the global database to get started.</p>
            <div className="flex gap-2 justify-center">
              <Link to="/import"><Button size="sm" className="gap-1.5"><Upload className="w-3.5 h-3.5" />Import Excel</Button></Link>
              <Link to={`/campaigns/${activeProjectId}`}><Button size="sm" variant="outline">Add from Companies</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress widget */}
      {!isEmpty && (
        <Card className="border-border/60 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Project Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-1 mb-3">
              {PROGRESS_STEPS.map(step => {
                const value = stats.progress[step.key] || 0;
                const pct = (value / progressMax) * 100;
                return (
                  <div key={step.key} className="flex-1">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${step.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
              {PROGRESS_STEPS.map(step => (
                <div key={step.key}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{step.label}</p>
                  <p className="text-lg font-bold">{(stats.progress[step.key] || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Companies"        value={stats.total}            icon={Building2}     color="bg-blue-100 text-blue-600"      loading={loadingPcs} to={`/campaigns/${activeProjectId}`} />
        <StatCard label="Email Ready"      value={stats.email_ready}      icon={Mail}          color="bg-green-100 text-green-600"    loading={loadingPcs || loadingCo} />
        <StatCard label="LinkedIn Ready"   value={stats.linkedin_ready}   icon={Linkedin}      color="bg-sky-100 text-sky-600"        loading={loadingPcs || loadingCo} />
        <StatCard label="Phone Ready"      value={stats.phone_ready}      icon={Phone}         color="bg-purple-100 text-purple-600"  loading={loadingPcs || loadingCo} />
        <StatCard label="Needs Enrichment" value={stats.needs_enrichment} icon={AlertTriangle} color="bg-amber-100 text-amber-600"    loading={loadingPcs || loadingCo} />
        <StatCard label="Drafts Generated" value={stats.drafts_generated} icon={FileText}      color="bg-indigo-100 text-indigo-600"  to="/outreach" />
        <StatCard label="Approved Drafts"  value={stats.drafts_approved}  icon={CheckCircle2}  color="bg-violet-100 text-violet-600"  to="/outreach" />
        <StatCard label="Scheduled Sends"  value={stats.scheduled_sends}  icon={Clock}         color="bg-amber-100 text-amber-600"    to="/outreach" />
        <StatCard label="Sent Emails"      value={stats.sent_emails}      icon={Send}          color="bg-green-100 text-green-600"    to="/outreach" />
        <StatCard label="Failed Sends"     value={stats.failed_sends}     icon={AlertTriangle} color="bg-red-100 text-red-600"        to="/outreach" />
        <StatCard label="Contacted"        value={stats.contacted}        icon={CheckCircle2}  color="bg-emerald-100 text-emerald-600" />
        <StatCard label="Replied"          value={stats.replied}          icon={Mail}          color="bg-teal-100 text-teal-600" />
      </div>

      {/* Quick actions */}
      <Card className="border-border/60">
        <CardHeader className="pb-3"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
        <CardContent className="pt-0 grid grid-cols-1 md:grid-cols-3 gap-2">
          <Link to={`/campaigns/${activeProjectId}`}>
            <Button variant="outline" className="w-full justify-between h-10">
              <span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Review Companies</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </Link>
          <Link to="/outreach">
            <Button variant="outline" className="w-full justify-between h-10">
              <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> Outreach Queue</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </Link>
          <Link to={`/campaigns/${activeProjectId}`}>
            <Button variant="outline" className="w-full justify-between h-10">
              <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Project Settings</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}