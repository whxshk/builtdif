import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { History, Upload, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  processing: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
};

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
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
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
          {jobs.map(job => (
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
                    </div>
                  </div>
                  <Badge className={STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600'}>
                    {job.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                  {[
                    { label: 'Total', value: job.total_rows, color: 'text-foreground' },
                    { label: 'Imported', value: job.imported_rows, color: 'text-green-600' },
                    { label: 'Updated', value: job.updated_rows, color: 'text-blue-600' },
                    { label: 'Duplicates', value: job.duplicate_rows, color: 'text-amber-600' },
                    { label: 'Errors', value: job.error_rows, color: 'text-red-500' },
                    { label: 'Email Ready', value: job.email_ready, color: 'text-emerald-600' },
                    { label: 'Needs Enrich', value: job.needs_enrichment, color: 'text-amber-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value ?? 0}</p>
                    </div>
                  ))}
                </div>

                {job.error_details && (
                  <details className="mt-3">
                    <summary className="text-xs text-red-600 cursor-pointer flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> View error details
                    </summary>
                    <pre className="mt-2 text-xs font-mono bg-red-50 border border-red-100 rounded p-2 max-h-32 overflow-y-auto">
                      {typeof job.error_details === 'string' ? job.error_details : JSON.stringify(JSON.parse(job.error_details), null, 2)}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}