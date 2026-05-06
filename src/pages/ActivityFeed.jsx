import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import {
  Upload, Zap, CheckCircle2, Send, MessageSquare, CheckSquare,
  FolderKanban, RefreshCw, Search, Users, BarChart3
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ACTION_CONFIG = {
  import:               { icon: Upload,        color: 'bg-blue-100 text-blue-600',     label: 'Import' },
  outreach_generated:   { icon: Zap,           color: 'bg-violet-100 text-violet-600', label: 'Generated' },
  draft_approved:       { icon: CheckCircle2,  color: 'bg-green-100 text-green-600',   label: 'Approved' },
  email_sent:           { icon: Send,          color: 'bg-sky-100 text-sky-600',       label: 'Sent' },
  reply_received:       { icon: MessageSquare, color: 'bg-emerald-100 text-emerald-600', label: 'Reply' },
  task_completed:       { icon: CheckSquare,   color: 'bg-teal-100 text-teal-600',     label: 'Task Done' },
  project_created:      { icon: FolderKanban,  color: 'bg-indigo-100 text-indigo-600', label: 'Project' },
  project_updated:      { icon: FolderKanban,  color: 'bg-indigo-100 text-indigo-600', label: 'Updated' },
  enrichment_retry:     { icon: RefreshCw,     color: 'bg-amber-100 text-amber-600',   label: 'Enrichment' },
  contact_discovered:   { icon: Users,         color: 'bg-pink-100 text-pink-600',     label: 'Contact' },
  sequence_enrolled:    { icon: BarChart3,     color: 'bg-cyan-100 text-cyan-600',     label: 'Sequence' },
  bulk_action:          { icon: Zap,           color: 'bg-orange-100 text-orange-600', label: 'Bulk' },
};

export default function ActivityFeed() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-feed'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 200),
  });

  // Also pull outreach logs as activity
  const { data: outreachLogs = [] } = useQuery({
    queryKey: ['outreach-logs-activity'],
    queryFn: () => base44.entities.OutreachLog.list('-created_date', 100),
  });

  // Merge and normalize
  const activityItems = [
    ...logs.map(l => ({
      id: 'al-' + l.id,
      action_type: l.action_type,
      entity_name: l.entity_name,
      entity_id: l.entity_id,
      entity_type: l.entity_type,
      details: l.details,
      user_email: l.user_email,
      created_date: l.created_date,
    })),
    ...outreachLogs.map(l => ({
      id: 'ol-' + l.id,
      action_type: l.status === 'sent' ? 'email_sent' : l.status === 'replied' ? 'reply_received' : 'outreach_generated',
      entity_name: l.company_name,
      entity_id: l.company_id,
      entity_type: 'Company',
      details: `${l.action?.replace(/_/g, ' ')} via ${l.channel}`,
      user_email: null,
      created_date: l.created_date,
    })),
  ].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const filtered = activityItems.filter(item => {
    if (typeFilter !== 'all' && item.action_type !== typeFilter) return false;
    if (search && !item.entity_name?.toLowerCase().includes(search.toLowerCase()) &&
        !item.details?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionTypes = [...new Set(activityItems.map(i => i.action_type))];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Activity Feed</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Global platform activity timeline</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['activity-feed'] })} className="gap-1.5 h-8 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <div className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search activity..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 flex-wrap">
          <button onClick={() => setTypeFilter('all')} className={cn('px-2.5 py-1.5 rounded-md text-xs font-medium transition-all', typeFilter === 'all' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>All</button>
          {actionTypes.slice(0, 6).map(t => {
            const cfg = ACTION_CONFIG[t];
            return (
              <button key={t} onClick={() => setTypeFilter(t)} className={cn('px-2.5 py-1.5 rounded-md text-xs font-medium transition-all', typeFilter === t ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {cfg?.label || t}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>No activity yet. Start outreach to see the feed.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border" />
          <div className="space-y-1">
            {filtered.map((item, i) => {
              const cfg = ACTION_CONFIG[item.action_type] || ACTION_CONFIG.bulk_action;
              const Icon = cfg.icon;
              return (
                <div key={item.id} className="flex gap-4 pl-1">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-background z-10 relative', cfg.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 bg-card border border-border/40 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow mb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn('text-[10px] px-1.5 py-0', cfg.color)}>{cfg.label}</Badge>
                          {item.entity_name && item.entity_type === 'Company' ? (
                            <Link to={`/companies/${item.entity_id}`} className="text-sm font-semibold hover:text-primary truncate">
                              {item.entity_name}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold truncate">{item.entity_name}</span>
                          )}
                        </div>
                        {item.details && <p className="text-xs text-muted-foreground mt-0.5">{item.details}</p>}
                        {item.user_email && <p className="text-[10px] text-muted-foreground mt-0.5">by {item.user_email}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {item.created_date ? formatDistanceToNow(new Date(item.created_date), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}