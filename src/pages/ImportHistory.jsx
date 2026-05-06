import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { History, Upload, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_META = {
  completed:            { label: 'Completed',       cls: 'bg-green-100 text-green-700' },
  partial_success:      { label: 'Partial',         cls: 'bg-amber-100 text-amber-700' },
  completed_no_records: { label: 'No Records',      cls: 'bg-orange-100 text-orange-700' },
  failed:               { label: 'Failed',          cls: 'bg-red-100 text-red-600' },
  processing:           { label: 'Processing',      cls: 'bg-blue-100 text-blue-700' },
  pending:              { label: 'Pending',          cls: 'bg-gray-100 text-gray-600' },
};

const SKIP_REASON_LABELS = {
  empty_row:            'Empty rows',
  missing_company_name: 'Missing company name',
  duplicate_in_file:    'Duplicate in file',
  duplicate_existing:   'Already in DB',
  save_failed:          'Save error',
};

function SkipReasonBar({ skipReasonsJson }) {
  if (!skipReasonsJson) return null;
  let reasons;
  try { reasons = JSON.parse(skipReasonsJson); } catch { return null; }
  const entries = Object.entries(reasons).filter(([, v]) => v > 0);
  if (!entries.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([key, count]) => (
        <span key={key} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-amber-700">
          {SKIP_REASON_LABELS[key] ?? key}: {count}
        </span>
      ))}
    </div>
  );
}

function ColumnMappingRow({ mappingJson }) {
  const [open, setOpen] = useState(false);
  if (!mappingJson) return null;
  let mapping;
  try { mapping = JSON.parse(mappingJson); } catch { return null; }
  if (!mapping?.length) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Column mapping ({mapping.length} recognized)
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {mapping.map((m, i) => (
            <span key={i} className="text-xs font-mono bg-muted/40 border border-border/40 rounded px-2 py-0.5">
              {m.raw} → {m.field}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImportHistory() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => base44.entities.ImportJob.list('-created_date', 100),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Import History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All Excel import jobs</p>
        </div>
        <Link to="/import">
          <Button size="sm" className="gap-2"><Upload className="w-4 h-4" /> New Import</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-16 text-center">
            <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No imports yet</p>
            <Link to="/import">
              <Button variant="outline" size="sm" className="mt-3">Import your first file</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => {
            const meta = STATUS_META[job.status] ?? { label: job.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <Card key={job.id} className="border-border/60 hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Upload className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.created_date ? format(new Date(job.created_date), 'MMM d, yyyy HH:mm') : ''}
                          {' · '}{job.created_date ? formatDistanceToNow(new Date(job.created_date), { addSuffix: true }) : ''}
                        </p>
                        {job.detected_sheet && (
                          <p className="text-xs text-muted-foreground/70 font-mono">
                            Sheet: {job.detected_sheet}
                            {job.detected_header_row != null ? ` · Header row: ${job.detected_header_row}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge className={meta.cls}>{meta.label}</Badge>
                  </div>

                  <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                    {[
                      { label: 'Total',       value: job.total_rows,      color: 'text-foreground' },
                      { label: 'Imported',    value: job.imported_rows,   color: 'text-green-600' },
                      { label: 'Updated',     value: job.updated_rows,    color: 'text-blue-600' },
                      { label: 'Duplicates',  value: job.duplicate_rows,  color: 'text-amber-600' },
                      { label: 'Skipped',     value: job.skipped_rows,    color: 'text-gray-500' },
                      { label: 'Errors',      value: job.error_rows,      color: 'text-red-500' },
                      { label: 'Email Ready', value: job.email_ready,     color: 'text-emerald-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-xl font-bold ${color}`}>{value ?? 0}</p>
                      </div>
                    ))}
                  </div>

                  {/* Skip reason breakdown */}
                  <SkipReasonBar skipReasonsJson={job.skip_reasons} />

                  {/* Column mapping */}
                  <ColumnMappingRow mappingJson={job.column_mapping} />

                  {/* Error details */}
                  {job.error_details && (
                    <details className="mt-3">
                      <summary className="text-xs text-red-600 cursor-pointer flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> View error details
                      </summary>
                      <pre className="mt-2 text-xs font-mono bg-red-50 border border-red-100 rounded p-2 max-h-32 overflow-y-auto">
                        {typeof job.error_details === 'string'
                          ? (() => { try { return JSON.stringify(JSON.parse(job.error_details), null, 2); } catch { return job.error_details; } })()
                          : JSON.stringify(job.error_details, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
