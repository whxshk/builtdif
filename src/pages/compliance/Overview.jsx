import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, StopCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

const HEALTH_COLORS = {
  healthy: 'text-green-600 bg-green-100',
  warming_up: 'text-amber-600 bg-amber-100',
  limited: 'text-orange-600 bg-orange-100',
  paused: 'text-red-600 bg-red-100',
  risky: 'text-red-700 bg-red-100',
  blocked: 'text-red-800 bg-red-200',
  disconnected: 'text-gray-500 bg-gray-100',
};

export default function ComplianceOverview() {
  const qc = useQueryClient();
  const [stopping, setStopping] = useState(false);

  const { data: overview, isLoading } = useQuery({
    queryKey: ['compliance-overview'],
    queryFn: async () => {
      const res = await base44.functions.invoke('complianceEngine', { action: 'overview' });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['sending-accounts'],
    queryFn: () => base44.entities.SendingAccount.list('-created_date', 100),
  });

  const { data: recentScheduled = [] } = useQuery({
    queryKey: ['scheduled-outreach-recent'],
    queryFn: () => base44.entities.ScheduledOutreach.list('-created_date', 50),
  });

  const handleEmergencyStop = async (scope = 'all') => {
    setStopping(true);
    await base44.functions.invoke('complianceEngine', { action: 'emergency_stop', scope });
    qc.invalidateQueries();
    toast.error('Emergency stop applied — all scheduled sends paused');
    setStopping(false);
  };

  const statCards = overview ? [
    { label: 'Active Accounts',    value: overview.accounts?.healthy || 0,               color: 'text-green-600' },
    { label: 'Paused Accounts',    value: overview.accounts?.paused || 0,                color: 'text-amber-600' },
    { label: 'Blocked Accounts',   value: overview.accounts?.blocked || 0,               color: 'text-red-600' },
    { label: 'Scheduled Sends',    value: overview.scheduled?.scheduled || 0,            color: 'text-blue-600' },
    { label: 'Compliance Blocked', value: overview.scheduled?.compliance_blocked || 0,   color: 'text-red-500' },
    { label: 'Suppressed Contacts',value: overview.suppression?.total || 0,             color: 'text-gray-600' },
    { label: 'Total Sent',         value: overview.scheduled?.sent || 0,                color: 'text-green-600' },
    { label: 'Failed Sends',       value: overview.scheduled?.failed || 0,              color: 'text-red-600' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compliance Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time health of all outreach channels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['compliance-overview'] })} className="gap-1.5 h-8 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={() => handleEmergencyStop('all')} disabled={stopping} className="gap-1.5 h-8 text-xs">
            {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
            Emergency Stop All
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map(({ label, value, color }) => (
            <Card key={label} className="border-border/60">
              <CardContent className="py-4 px-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sending Accounts Health */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sending Accounts</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No sending accounts configured. Add accounts in the Sending Accounts section.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/40">
                  <div className={cn('px-2 py-0.5 rounded-full text-xs font-medium', HEALTH_COLORS[acc.health_status] || 'bg-gray-100 text-gray-600')}>
                    {acc.health_status?.replace(/_/g, ' ')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.account_name}</p>
                    <p className="text-xs text-muted-foreground">{acc.channel} · {acc.email_address || acc.phone_number || acc.linkedin_profile_url || 'No contact'}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{acc.sends_today || 0} / {acc.daily_limit || 100} today</p>
                    <p className="text-[10px]">{acc.bounce_rate?.toFixed(1) || '0.0'}% bounce</p>
                  </div>
                  {acc.health_status === 'paused' || !acc.is_active ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-300" onClick={async () => {
                      await base44.entities.SendingAccount.update(acc.id, { is_active: true, health_status: 'healthy', paused_reason: null });
                      qc.invalidateQueries();
                      toast.success('Account resumed');
                    }}>Resume</Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300" onClick={async () => {
                      await base44.functions.invoke('complianceEngine', { action: 'emergency_stop', scope: 'account', sending_account_id: acc.id });
                      qc.invalidateQueries();
                      toast.warning('Account paused');
                    }}>Pause</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent scheduled jobs */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent Scheduled Sends</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentScheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No scheduled sends yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {['Company', 'Channel', 'Status', 'Scheduled For', 'Risk', 'Notes'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentScheduled.map(job => (
                    <tr key={job.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{job.company_name || '—'}</td>
                      <td className="px-3 py-2 capitalize">{job.channel}</td>
                      <td className="px-3 py-2">
                        <span className={cn('px-2 py-0.5 rounded-full font-medium', {
                          'bg-blue-100 text-blue-700': job.status === 'scheduled',
                          'bg-green-100 text-green-700': job.status === 'sent',
                          'bg-red-100 text-red-700': ['failed', 'compliance_blocked'].includes(job.status),
                          'bg-amber-100 text-amber-700': job.status === 'paused',
                          'bg-gray-100 text-gray-600': ['queued', 'skipped', 'cancelled'].includes(job.status),
                        })}>
                          {job.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {job.scheduled_for ? formatDistanceToNow(new Date(job.scheduled_for), { addSuffix: true }) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', {
                          'bg-green-100 text-green-700': job.risk_level === 'low',
                          'bg-amber-100 text-amber-700': job.risk_level === 'medium',
                          'bg-red-100 text-red-700': ['high', 'blocked'].includes(job.risk_level),
                        })}>{job.risk_level || 'low'}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{job.compliance_notes || job.last_error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      {overview?.recent_audit?.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Audit Log</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {overview.recent_audit.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/20">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', log.result === 'success' ? 'bg-green-500' : log.result === 'blocked' ? 'bg-red-500' : 'bg-amber-500')} />
                  <span className="font-mono text-muted-foreground w-16 flex-shrink-0">{log.channel || 'sys'}</span>
                  <span className="font-medium flex-1">{log.action?.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">{log.user_email || 'system'}</span>
                  <span className="text-muted-foreground">{log.created_date ? formatDistanceToNow(new Date(log.created_date), { addSuffix: true }) : ''}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}