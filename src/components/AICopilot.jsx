import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ACTIONS = [
  { id: 'summarize',         label: 'Summarize Company',     color: 'text-blue-600' },
  { id: 'suggest_next_action', label: 'Suggest Next Action', color: 'text-green-600' },
  { id: 'generate_followup', label: 'Generate Follow-up',    color: 'text-violet-600' },
  { id: 'explain_history',   label: 'Explain History',       color: 'text-amber-600' },
  { id: 'recommend_channel', label: 'Best Channel',          color: 'text-sky-600' },
  { id: 'identify_missing',  label: 'Missing Data',          color: 'text-red-500' },
  { id: 'score_company',     label: 'AI Score',              color: 'text-purple-600' },
];

export default function AICopilot({ companyId, projectId, className }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const [results, setResults] = useState({});

  const handleAction = async (actionId) => {
    setLoading(actionId);
    const res = await base44.functions.invoke('aiCopilot', {
      action: actionId,
      company_id: companyId,
      project_id: projectId,
    });
    setResults(prev => ({ ...prev, [actionId]: res.data?.result }));
    setLoading(null);
    if (!open) setOpen(true);
  };

  const formatResult = (result) => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      if (result.score !== undefined) {
        return `Score: ${result.score}/100 · Priority: ${result.priority?.toUpperCase()} · ${result.reasoning} → Best channel: ${result.recommended_channel}`;
      }
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  };

  const latestResult = Object.entries(results).filter(([,v]) => v).slice(-1)[0];

  return (
    <div className={cn('border border-border/60 rounded-xl overflow-hidden bg-card', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold flex-1 text-left">AI Copilot</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/60">
          <div className="p-3 flex flex-wrap gap-1.5">
            {ACTIONS.map(({ id, label, color }) => (
              <Button
                key={id}
                size="sm"
                variant="outline"
                onClick={() => handleAction(id)}
                disabled={loading !== null}
                className={cn('h-7 text-xs gap-1', color)}
              >
                {loading === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {label}
              </Button>
            ))}
          </div>

          {latestResult && (
            <div className="border-t border-border/40 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {ACTIONS.find(a => a.id === latestResult[0])?.label}
                </Badge>
                <button
                  onClick={() => { navigator.clipboard.writeText(formatResult(latestResult[1])); toast.success('Copied'); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-foreground leading-relaxed bg-muted/30 rounded-lg p-2.5 whitespace-pre-wrap">
                {formatResult(latestResult[1])}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}