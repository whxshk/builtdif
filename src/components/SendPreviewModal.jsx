import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Send, Loader2, AlertTriangle, CheckCircle2, Ban,
  Mail, Users, Clock, BarChart3, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export default function SendPreviewModal({ open, onClose, projectId, channel = 'email', draftIds }) {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState([]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['sending-accounts-active', channel],
    queryFn: () => base44.entities.SendingAccount.filter({ channel, is_active: true }),
    enabled: open,
  });

  const loadPreview = async () => {
    setLoadingPreview(true);
    const res = await base44.functions.invoke('complianceEngine', {
      action: 'send_preview', project_id: projectId, channel,
    });
    setPreview(res.data);
    setLoadingPreview(false);
  };

  const handleSchedule = async () => {
    setScheduling(true);
    const res = await base44.functions.invoke('complianceEngine', {
      action: 'schedule_bulk',
      project_id: projectId,
      channel,
      draft_ids: draftIds,
      sending_account_ids: selectedAccounts,
    });
    if (res.data?.success) {
      const r = res.data.results;
      toast.success(`Scheduled ${r.scheduled} sends. ${r.compliance_blocked} blocked, ${r.suppressed} suppressed.`);
      onClose();
    } else {
      toast.error(res.data?.error || 'Scheduling failed');
    }
    setScheduling(false);
  };

  const RISK_COLORS = { low: 'text-green-600 bg-green-100', medium: 'text-amber-600 bg-amber-100', high: 'text-red-600 bg-red-100', blocked: 'text-red-800 bg-red-200' };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" /> Campaign Send Preview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!preview && !loadingPreview && (
            <div className="text-center py-6">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mb-3">Run a compliance check before scheduling your campaign</p>
              <Button onClick={loadPreview} className="gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Check & Preview
              </Button>
            </div>
          )}

          {loadingPreview && (
            <div className="space-y-2 py-4">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              <p className="text-xs text-center text-muted-foreground animate-pulse">Running compliance checks...</p>
            </div>
          )}

          {preview && !loadingPreview && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Total Selected',   value: preview.total_selected,    IconComp: Mail,         color: 'text-foreground' },
                  { label: 'Eligible to Send', value: preview.eligible,          IconComp: CheckCircle2, color: 'text-green-600' },
                  { label: 'Missing Email',    value: preview.missing_email,     IconComp: AlertTriangle,color: 'text-amber-600' },
                  { label: 'Suppressed',       value: preview.suppressed,        IconComp: Ban,          color: 'text-red-500' },
                  { label: 'Comp. Blocked',    value: preview.compliance_blocked,IconComp: X,            color: 'text-red-700' },
                  { label: 'Sending Accounts', value: preview.sending_accounts,  IconComp: Users,        color: 'text-blue-600' },
                ].map(({ label, value, IconComp, color }) => (
                  <div key={label} className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/30 rounded-lg border border-border/40">
                    <IconComp className={cn('w-4 h-4 flex-shrink-0', color)} />
                    <div>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className={cn('text-base font-bold', color)}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 rounded-lg border border-border/40">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Est. Completion</p>
                    <p className="text-sm font-bold">{preview.estimated_days === 1 ? 'Today' : `~${preview.estimated_days} days`}</p>
                  </div>
                </div>
                <Badge className={cn('text-xs', RISK_COLORS[preview.risk_level] || RISK_COLORS.low)}>
                  {preview.risk_level?.toUpperCase()} RISK
                </Badge>
              </div>

              {/* Select sending accounts */}
              {accounts.length > 1 && (
                <div>
                  <Label className="text-xs">Sending Accounts (leave empty to use all active)</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccounts(p => p.includes(acc.id) ? p.filter(x => x !== acc.id) : [...p, acc.id])}
                        className={cn('px-2.5 py-1 rounded-lg text-xs border transition-all',
                          selectedAccounts.includes(acc.id)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                        )}
                      >
                        {acc.account_name} ({acc.daily_limit}/day)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {preview.eligible === 0 && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  No eligible contacts to send to. Check suppression list and compliance settings.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          {preview && (
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              disabled={scheduling || preview.eligible === 0}
              onClick={handleSchedule}
            >
              {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Schedule {preview.eligible} Sends
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}