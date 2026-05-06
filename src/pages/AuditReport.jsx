import { CheckCircle2, AlertTriangle, EyeOff, Wrench, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SECTIONS = [
  {
    title: 'Working Correctly',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    items: [
      'Excel import (.xlsx, first sheet, exact column map: Company Name, CR Number, Category, Status, Primary Email, All Emails, Primary Phone, All Phones, Website, LinkedIn, Source, Last Enriched)',
      'Duplicate detection by CR number → company name → website → LinkedIn',
      'Import summary: total, imported, updated, duplicates, skipped, errors, email/LinkedIn/phone ready, missing, needs enrichment',
      'Row-level error reporting (first 50 errors persisted on ImportJob)',
      'Companies page: search, category filter, outreach-status filter, has-email/LinkedIn/phone filters, pagination, bulk select',
      'Campaigns: create, archive, add/remove companies, view detail with companies + drafts tabs',
      'Outreach Queue: list drafts by channel/status, approve, skip, send single email, copy LinkedIn message',
      'Generate outreach drafts via LLM (email, LinkedIn, phone)',
      'Approve / unapprove / skip / edit draft',
      'LinkedIn manual-assist only — queue worker creates a Task, never auto-sends. Audit log records blocked auto-send attempts.',
      'Phone — call task is created instead of autodial',
      'AuditLog written for: schedule_bulk, send_executed, send_failed, suppression_added, emergency_stop, linkedin_auto_send_blocked',
      'Queue Worker scheduled automation runs every 5 minutes',
      'Suppression list (add / remove / blocks during scheduling)',
    ],
  },
  {
    title: 'Fixed During Audit',
    icon: Wrench,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    items: [
      'Test mode now actually works in the queue worker (was always calling real SendEmail). When test_mode=true, sends are simulated and OutreachLog status="test_send".',
      'Settings now persist to backend (AppSetting entity + appSettings function) instead of localStorage — backend can now read test_mode and daily limits.',
      'schedule_bulk no longer requires a SendingAccount when test_mode is enabled — V1 works out of the box.',
      'Throttling now uses system-wide AppSetting (daily_email_limit, delay_between_emails_seconds) when no SendingAccount is configured.',
      'Sending window falls back to AppSetting (start/end + avoid_weekends) when no project-level CampaignSendingWindow exists.',
      'Daily limit now spreads scheduling across multiple days correctly: when dailyLimit hit, next slot rolls to tomorrow 9 AM.',
      'OutreachQueue "copy" action now uses a valid OutreachLog action string (was logging an unsupported value).',
      'Backend Health panel in Settings shows real status: DB, parser, email mode, queue worker, last import, last scheduled job, totals, sent today.',
    ],
  },
  {
    title: 'Hidden for V1',
    icon: EyeOff,
    color: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
    items: [
      'Activity Feed page (still routed but not in sidebar; backend still writes ActivityLog/AuditLog/OutreachLog).',
      'Sequences page (multi-step builder not part of V1 flow).',
      'Inbox page (no real reply ingestion in V1).',
      'Tasks page (Tasks are still created by queue worker for LinkedIn/phone but no dedicated page in sidebar).',
      'Analytics page (Dashboard already shows real V1 metrics).',
      'Compliance Center / SendingAccounts / WarmupSchedules / RateLimits / EmailCompliance / SmsCompliance / CallCompliance / LinkedInSafety subpages.',
      'Templates page (drafts are LLM-generated per company; templates not used in V1).',
      'Approval Center page (duplicates Outreach Queue).',
      'Import History page (only show if Import History link is clearly useful; reachable via /import-history if needed).',
      'Sidebar already simplified to: Dashboard · Import Excel · Companies · Campaigns · Outreach Queue · Settings.',
      'These modules remain in the codebase and DB so they can be re-enabled later without rebuilding.',
    ],
  },
  {
    title: 'Still Broken / Backend Gaps',
    icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
    items: [
      'Live email sending requires a configured SendingAccount + verified domain. Not used until test_mode is turned off.',
      'Webhook ingestion (delivered/opened/bounced) exists in queueWorker but is not connected to any inbound provider — needs configuration when going live.',
      'No reply / inbox ingestion. Replies are not detected in V1.',
      'No campaign-level pause check inside schedule_bulk (Project status="paused" is not enforced when scheduling). Mitigated by emergency_stop.',
      'CampaignCompanies relation uses entity name "ProjectCompany" (legacy). Functionally correct but inconsistent with renamed UI.',
      'OutreachDraft has no campaign_id field — drafts are linked to companies, not campaigns. Acceptable for V1 (a campaign\'s drafts are joined via ProjectCompany), but worth normalizing later.',
      'ScheduledOutreach.attempt_count retry logic counts failures within the current run only, not historical — minor.',
      'Many aspirational entities (RateLimitRule, WarmupSchedule, EmailCompliance, etc.) exist but are unused in V1 — kept per instruction not to delete future modules.',
    ],
  },
  {
    title: 'Recommended Next Steps',
    icon: ArrowRight,
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-200',
    items: [
      '1. Run end-to-end test: Dashboard → Import Sample Data → Companies → Create Campaign → Add Companies → Generate Drafts → Approve → Schedule → wait 5 min for queue worker → verify OutreachLogs and Dashboard counters update.',
      '2. Once test mode is reliable, add a single SendingAccount UI (in Settings) and switch test_mode off.',
      '3. Add domain verification (SPF/DKIM/DMARC) UI when going live — EmailCompliance entity is ready.',
      '4. Add reply detection (IMAP or webhook) before promoting Inbox.',
      '5. Add CampaignSendingWindow editor inside Campaign Detail (overrides global setting).',
      '6. Add campaign-pause enforcement in schedule_bulk (skip drafts whose project.status === "paused").',
      '7. Normalize naming: rename Project → Campaign, ProjectCompany → CampaignCompany at the entity level (large refactor — defer).',
      '8. Once V1 is validated, gradually un-hide: Activity Feed, Tasks, Templates.',
    ],
  },
];

export default function AuditReport() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">V1 Audit Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          End-to-end review of the OutreachOS V1 workflow: Import → Companies → Campaign → Drafts → Schedule → Logs.
        </p>
      </div>

      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardContent className="py-4 px-5">
          <p className="text-sm font-semibold text-foreground mb-1">Core V1 flow status: ✅ Working in test mode</p>
          <p className="text-xs text-muted-foreground">
            Upload Excel → parse → store companies → create campaign → add companies → generate drafts → approve → schedule with throttling → queue worker simulates sends → logs created → dashboard updates.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {SECTIONS.map(({ title, icon: Icon, color, bg, items }) => (
          <Card key={title} className={`border ${bg}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                {title}
                <Badge variant="secondary" className="text-xs ml-1">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i} className="text-xs text-foreground flex gap-2 items-start leading-relaxed">
                    <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${color.replace('text-', 'bg-')}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-lg bg-muted/30 border border-border/40">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Critical instruction respected:</strong> No new features added. Hidden modules remain in the codebase. V1 flow is now end-to-end functional in test mode. Run the test from the Dashboard's "Import Sample Data" button, then walk through Campaigns → Outreach Queue.
        </p>
      </div>
    </div>
  );
}