import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import {
  Mail, Search, Inbox as InboxIcon,
  ArrowUpRight, Phone, Linkedin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_CONFIG = {
  queued:    { color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  sent:      { color: 'bg-blue-100 text-blue-600',    dot: 'bg-blue-400' },
  delivered: { color: 'bg-sky-100 text-sky-600',      dot: 'bg-sky-400' },
  opened:    { color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400' },
  replied:   { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  bounced:   { color: 'bg-red-100 text-red-600',      dot: 'bg-red-500' },
  failed:    { color: 'bg-red-100 text-red-700',      dot: 'bg-red-600' },
  no_answer: { color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
  answered:  { color: 'bg-green-100 text-green-600',  dot: 'bg-green-400' },
  copied:    { color: 'bg-purple-100 text-purple-600',dot: 'bg-purple-400' },
  test_send: { color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300' },
  completed: { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  interested:{ color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  not_interested:{ color: 'bg-red-100 text-red-600',  dot: 'bg-red-400' },
};

const CHANNEL_ICONS = { email: Mail, linkedin: Linkedin, phone: Phone };

function ConversationItem({ company, logs, selected, onClick }) {
  const latest = logs[0];
  const hasReply = logs.some(l => l.status === 'replied' || l.status === 'answered' || l.status === 'interested');
  const sc = STATUS_CONFIG[latest?.status] || STATUS_CONFIG.sent;
  const ChannelIcon = CHANNEL_ICONS[latest?.channel] || Mail;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 border-b border-border/40 hover:bg-muted/30 transition-colors',
        selected && 'bg-primary/5 border-l-2 border-l-primary'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
          hasReply ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
        )}>
          {company?.company_name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold truncate">{company?.company_name || 'Unknown'}</p>
            <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
              {latest?.created_date ? formatDistanceToNow(new Date(latest.created_date), { addSuffix: true }) : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChannelIcon className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground truncate">{latest?.action?.replace(/_/g, ' ') || 'No activity'}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', sc.dot)} />
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sc.color)}>{latest?.status}</span>
            {hasReply && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700">Reply</Badge>}
          </div>
        </div>
      </div>
    </button>
  );
}

function ThreadView({ company, logs }) {
  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <InboxIcon className="w-12 h-12 mb-3 opacity-20" />
        <p className="font-medium">Select a conversation</p>
        <p className="text-sm">Choose a company from the left to view the outreach thread</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
          {company.company_name?.[0]}
        </div>
        <div className="flex-1">
          <h3 className="font-bold">{company.company_name}</h3>
          <p className="text-xs text-muted-foreground">{logs.length} interactions · {company.primary_email || 'No email'}</p>
        </div>
        <Link to={`/companies/${company.id}`}>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
            <ArrowUpRight className="w-3.5 h-3.5" /> Profile
          </Button>
        </Link>
      </div>

      {/* Thread body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No outreach logs yet</div>
        ) : (
          logs.map(log => {
            const sc = STATUS_CONFIG[log.status] || STATUS_CONFIG.sent;
            const Icon = CHANNEL_ICONS[log.channel] || Mail;
            const isReply = ['replied', 'answered', 'interested'].includes(log.status);
            return (
              <div key={log.id} className={cn('flex gap-3', isReply ? 'flex-row-reverse' : '')}>
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                  isReply ? 'bg-green-100' : 'bg-muted'
                )}>
                  <Icon className={cn('w-3.5 h-3.5', isReply ? 'text-green-600' : 'text-muted-foreground')} />
                </div>
                <div className={cn('max-w-[70%] rounded-xl px-4 py-3 text-sm',
                  isReply ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-card border border-border text-foreground'
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">{isReply ? 'Reply' : 'Sent'} · {log.action?.replace(/_/g, ' ')}</span>
                    <div className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                    <span className="text-[10px] text-muted-foreground">{log.status}</span>
                  </div>
                  {log.notes && <p className="text-xs">{log.notes}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {log.created_date ? format(new Date(log.created_date), 'MMM d, HH:mm') : ''}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CompanySidebar({ company, logs }) {
  if (!company) return <div className="p-4 text-xs text-muted-foreground">Select a company</div>;

  const stats = {
    total: logs.length,
    sent: logs.filter(l => ['sent', 'delivered', 'opened'].includes(l.status)).length,
    replied: logs.filter(l => ['replied', 'answered', 'interested'].includes(l.status)).length,
    email: logs.filter(l => l.channel === 'email').length,
    linkedin: logs.filter(l => l.channel === 'linkedin').length,
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Company</p>
        <p className="font-bold text-sm">{company.company_name}</p>
        {company.category && <p className="text-xs text-muted-foreground">{company.category}</p>}
        {company.cr_number && <p className="text-xs font-mono text-muted-foreground">CR {company.cr_number}</p>}
      </div>
      <div className="space-y-1.5">
        {company.primary_email && (
          <div className="flex items-center gap-2 text-xs"><Mail className="w-3.5 h-3.5 text-blue-500" /><span className="truncate">{company.primary_email}</span></div>
        )}
        {company.primary_phone && (
          <div className="flex items-center gap-2 text-xs"><Phone className="w-3.5 h-3.5 text-purple-500" /><span>{company.primary_phone}</span></div>
        )}
        {company.linkedin_url && (
          <div className="flex items-center gap-2 text-xs"><Linkedin className="w-3.5 h-3.5 text-sky-500" /><a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">LinkedIn</a></div>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Thread Stats</p>
        {[
          { label: 'Total Interactions', value: stats.total },
          { label: 'Sent/Delivered', value: stats.sent },
          { label: 'Replies', value: stats.replied, color: stats.replied > 0 ? 'text-green-600' : '' },
          { label: 'Emails', value: stats.email },
          { label: 'LinkedIn', value: stats.linkedin },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={cn('text-xs font-bold', color)}>{value}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-3">
        <Link to={`/companies/${company.id}`}>
          <Button size="sm" variant="outline" className="w-full text-xs h-8 gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5" /> Open Full Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function Inbox() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['inbox-logs'],
    queryFn: () => base44.entities.OutreachLog.list('-created_date', 500),
  });

  const { data: companies = [], isLoading: loadingCo } = useQuery({
    queryKey: ['companies-inbox'],
    queryFn: () => base44.entities.Company.list('-created_date', 2000),
  });

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

  // Group logs by company
  const grouped = {};
  for (const log of logs) {
    if (!grouped[log.company_id]) grouped[log.company_id] = [];
    grouped[log.company_id].push(log);
  }

  let conversations = Object.entries(grouped).map(([cid, clogs]) => ({
    companyId: cid,
    company: companyMap[cid],
    logs: clogs,
    latestStatus: clogs[0]?.status,
    hasReply: clogs.some(l => ['replied', 'answered', 'interested'].includes(l.status)),
  })).sort((a, b) => {
    const at = new Date(a.logs[0]?.created_date || 0);
    const bt = new Date(b.logs[0]?.created_date || 0);
    return bt - at;
  });

  if (statusFilter === 'replied') conversations = conversations.filter(c => c.hasReply);
  else if (statusFilter === 'no_reply') conversations = conversations.filter(c => !c.hasReply && c.logs.some(l => l.status === 'sent'));
  if (search) conversations = conversations.filter(c => c.company?.company_name?.toLowerCase().includes(search.toLowerCase()));

  const selectedConversation = conversations.find(c => c.companyId === selectedCompanyId);
  const selectedCompany = selectedConversation?.company;
  const selectedLogs = selectedConversation?.logs || [];

  const loading = loadingLogs || loadingCo;

  return (
    <div className="flex h-full">
      {/* Left: Conversation list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base">Inbox</h2>
            <Badge variant="secondary" className="text-xs">{conversations.length}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Threads</SelectItem>
              <SelectItem value="replied">With Replies</SelectItem>
              <SelectItem value="no_reply">No Reply</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm px-4">
              <InboxIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No conversations yet
            </div>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.companyId}
                company={conv.company}
                logs={conv.logs}
                selected={selectedCompanyId === conv.companyId}
                onClick={() => setSelectedCompanyId(conv.companyId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Center: Thread */}
      <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
        <ThreadView company={selectedCompany} logs={selectedLogs} />
      </div>

      {/* Right: Company summary */}
      <div className="w-56 flex-shrink-0">
        <CompanySidebar company={selectedCompany} logs={selectedLogs} />
      </div>
    </div>
  );
}