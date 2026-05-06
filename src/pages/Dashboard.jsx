import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Upload, Send, CheckCircle2, Clock, Mail,
  Linkedin, Phone, ArrowRight, FileSpreadsheet, Zap, TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ['dashboard-companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 500),
  });

  const { data: drafts = [], isLoading: loadingDrafts } = useQuery({
    queryKey: ['dashboard-drafts'],
    queryFn: () => base44.entities.OutreachDraft.list('-created_date', 500),
  });

  const { data: imports = [], isLoading: loadingImports } = useQuery({
    queryKey: ['dashboard-imports'],
    queryFn: () => base44.entities.ImportJob.list('-created_date', 5),
  });

  const isLoading = loadingCompanies || loadingDrafts || loadingImports;

  const stats = {
    totalCompanies: companies.length,
    needsEnrichment: companies.filter(c => c.enrichment_status === 'needs_enrichment').length,
    contacted: companies.filter(c => c.outreach_status === 'contacted' || c.outreach_status === 'responded').length,
    skipped: companies.filter(c => c.outreach_status === 'skipped').length,
    pendingDrafts: drafts.filter(d => d.status === 'draft').length,
    approvedDrafts: drafts.filter(d => d.status === 'approved').length,
    sentDrafts: drafts.filter(d => d.status === 'sent').length,
    emailDrafts: drafts.filter(d => d.channel === 'email').length,
    linkedinDrafts: drafts.filter(d => d.channel === 'linkedin').length,
    phoneDrafts: drafts.filter(d => d.channel === 'phone').length,
  };

  const lastImport = imports[0];

  const StatCard = ({ label, value, icon: Icon, color = 'text-foreground', sub }) => (
    <Card className="border-border/60">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <Icon className={`w-4 h-4 ${color} opacity-70`} />
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System overview and quick actions</p>
      </div>

      {/* Company Stats */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Companies</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Companies" value={stats.totalCompanies} icon={Building2} color="text-foreground" />
        <StatCard label="Needs Enrichment" value={stats.needsEnrichment} icon={Zap} color="text-amber-500" />
        <StatCard label="Contacted" value={stats.contacted} icon={CheckCircle2} color="text-green-600" />
        <StatCard label="Skipped" value={stats.skipped} icon={Clock} color="text-muted-foreground" />
      </div>

      {/* Outreach Stats */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Outreach Drafts</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Pending Review" value={stats.pendingDrafts} icon={Clock} color="text-amber-600" />
        <StatCard label="Approved" value={stats.approvedDrafts} icon={CheckCircle2} color="text-blue-600" />
        <StatCard label="Sent" value={stats.sentDrafts} icon={Send} color="text-green-600" />
        <StatCard label="Email Drafts" value={stats.emailDrafts} icon={Mail} color="text-blue-500" />
        <StatCard label="LinkedIn Drafts" value={stats.linkedinDrafts} icon={Linkedin} color="text-sky-500" />
        <StatCard label="Phone Drafts" value={stats.phoneDrafts} icon={Phone} color="text-purple-500" />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quick Actions */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Link to="/import">
              <Button variant="outline" className="w-full justify-between h-9 text-sm">
                <span className="flex items-center gap-2"><Upload className="w-4 h-4" /> Import Excel File</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </Link>
            <Link to="/companies">
              <Button variant="outline" className="w-full justify-between h-9 text-sm">
                <span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> View Companies</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </Link>
            <Link to="/outreach">
              <Button variant="outline" className="w-full justify-between h-9 text-sm">
                <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Review Outreach Queue</span>
                {stats.pendingDrafts > 0 && <Badge className="bg-amber-100 text-amber-700 text-xs">{stats.pendingDrafts}</Badge>}
              </Button>
            </Link>
            <Link to="/campaigns">
              <Button variant="outline" className="w-full justify-between h-9 text-sm">
                <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Manage Campaigns</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Last Import */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Last Import</CardTitle>
              <Link to="/import-history" className="text-xs text-primary hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingImports ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : lastImport ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{lastImport.filename}</span>
                  <Badge className={
                    lastImport.status === 'completed' ? 'bg-green-100 text-green-700' :
                    lastImport.status === 'partial_success' ? 'bg-amber-100 text-amber-700' :
                    lastImport.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }>{lastImport.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="font-semibold text-foreground">{lastImport.imported_rows ?? 0}</p>
                    <p className="text-muted-foreground">Imported</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="font-semibold text-foreground">{lastImport.updated_rows ?? 0}</p>
                    <p className="text-muted-foreground">Updated</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="font-semibold text-foreground">{lastImport.duplicate_rows ?? 0}</p>
                    <p className="text-muted-foreground">Duplicates</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <FileSpreadsheet className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No imports yet</p>
                <Link to="/import">
                  <Button size="sm" variant="outline" className="mt-3 h-7 text-xs">Import your first file</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}