import { useState, useRef, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, X,
  Loader2, Info, FolderKanban, Globe, Plus, ChevronDown, ChevronUp, Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useActiveProject } from '@/lib/ProjectContext';
import ProjectScopeBanner from '@/components/ProjectScopeBanner';

const MAPPABLE_FIELDS = [
  { value: 'company_name',   label: 'Company Name' },
  { value: 'cr_number',      label: 'CR Number' },
  { value: 'category',       label: 'Category / Industry' },
  { value: 'source',         label: 'Source' },
  { value: 'website',        label: 'Website' },
  { value: 'primary_email',  label: 'Primary Email' },
  { value: 'all_emails',     label: 'All Emails' },
  { value: 'primary_phone',  label: 'Primary Phone' },
  { value: 'all_phones',     label: 'All Phones' },
  { value: 'linkedin_url',   label: 'LinkedIn URL' },
  { value: 'whatsapp',       label: 'WhatsApp' },
  { value: 'contact_person', label: 'Contact Name' },
  { value: 'contact_title',  label: 'Contact Title' },
  { value: 'contact_email',  label: 'Contact Email' },
  { value: 'contact_phone',  label: 'Contact Phone' },
  { value: 'country',        label: 'Country' },
  { value: 'company_size',   label: 'Company Size' },
  { value: 'relation',       label: 'Relation' },
  { value: 'icp_fit',        label: 'ICP Fit' },
  { value: 'enrichment_status', label: 'Enrichment Status' },
  { value: 'last_enriched',  label: 'Last Enriched' },
];

const SUMMARY_FIELDS = [
  { key: 'total_rows',       label: 'Total Rows',        color: 'text-foreground' },
  { key: 'imported_rows',    label: 'Imported',          color: 'text-green-600' },
  { key: 'updated_rows',     label: 'Updated',           color: 'text-blue-600' },
  { key: 'duplicate_rows',   label: 'Duplicates',        color: 'text-amber-600' },
  { key: 'skipped_rows',     label: 'Skipped',           color: 'text-gray-500' },
  { key: 'error_rows',       label: 'Errors',            color: 'text-red-600' },
  { key: 'email_ready',      label: 'Email Ready',       color: 'text-emerald-600' },
  { key: 'linkedin_ready',   label: 'LinkedIn Ready',    color: 'text-sky-600' },
  { key: 'phone_ready',      label: 'Phone Ready',       color: 'text-purple-600' },
  { key: 'needs_enrichment', label: 'Needs Enrichment',  color: 'text-amber-600' },
  { key: 'missing_email',    label: 'Missing Email',     color: 'text-muted-foreground' },
  { key: 'missing_phone',    label: 'Missing Phone',     color: 'text-muted-foreground' },
  { key: 'missing_linkedin', label: 'Missing LinkedIn',  color: 'text-muted-foreground' },
];

const SKIP_REASON_LABELS = {
  empty_row:            'Empty rows',
  missing_company_name: 'Missing company name',
  duplicate_in_file:    'Duplicate within file',
  duplicate_existing:   'Already in database',
  save_failed:          'Save error',
};

function StatusBanner({ status, summary }) {
  const saved = (summary?.imported_rows ?? 0) + (summary?.updated_rows ?? 0);

  const effectiveStatus =
    (status === 'completed' && saved === 0 && (summary?.duplicate_rows ?? 0) > 0) ? 'no_new_records' :
    (status === 'completed' && saved === 0) ? 'completed_no_records' : status;

  if (effectiveStatus === 'completed' || (effectiveStatus === 'partial_success' && saved > 0 && !summary?.error_rows)) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-800">Import completed</p>
          <p className="text-sm text-green-700">
            {summary?.imported_rows ?? 0} new companies saved · {summary?.updated_rows ?? 0} updated
          </p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === 'partial_success') {
    return (
      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-800">Import completed with warnings</p>
          <p className="text-sm text-amber-700">
            {saved} companies saved · {summary?.skipped_rows ?? 0} skipped · {summary?.error_rows ?? 0} errors
          </p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === 'no_new_records') {
    return (
      <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-6 h-6 text-blue-500 flex-shrink-0" />
        <div>
          <p className="font-semibold text-blue-800">No new records — already imported</p>
          <p className="text-sm text-blue-700">
            {summary?.duplicate_rows ?? 0} companies already exist in the database.
            {summary?.skipped_rows > 0 ? ` ${summary.skipped_rows} rows skipped (missing company name).` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === 'completed_no_records') {
    const skipReasons = summary?.skip_reasons_parsed ?? {};
    const skipEntries = Object.entries(skipReasons);
    const topReason = skipEntries.length ? skipEntries.sort((a, b) => b[1] - a[1])[0] : null;
    const hint = topReason && topReason[1] > 0
      ? ` Main reason: ${SKIP_REASON_LABELS[topReason[0]] ?? topReason[0]} (${topReason[1]}).`
      : '';
    return (
      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-amber-800">Import finished, but no companies were saved.</p>
          <p className="text-sm text-amber-700">
            File was read ({summary?.total_rows ?? 0} rows), but 0 companies were imported.{hint}
            {' '}Check the Import Diagnostics below.
          </p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === 'failed') {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-800">Import failed</p>
          <p className="text-sm text-red-700">
            {summary?.error_rows ?? 0} errors encountered. Check Import Diagnostics below.
          </p>
        </div>
      </div>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
      <Info className="w-6 h-6 text-gray-500 flex-shrink-0" />
      <p className="text-sm text-gray-700">Import status: {status}</p>
    </div>
  );
}

function DiagnosticsPanel({ diagnostics, summary }) {
  // Auto-open when nothing was saved so the user sees the reason immediately
  const nothingSaved = (summary?.imported_rows ?? 0) + (summary?.updated_rows ?? 0) === 0;
  const [open, setOpen] = useState(nothingSaved);
  if (!diagnostics) return null;

  const skipReasons = summary?.skip_reasons_parsed ?? {};

  return (
    <Card className="border-border/60">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Bug className="w-4 h-4 text-muted-foreground" />
          Import Diagnostics
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40 pt-3">

          {/* Sheet + header detection */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detection</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/30 rounded p-2">
                <span className="text-muted-foreground">Sheet selected:</span>{' '}
                <span className="font-mono font-medium">{diagnostics.detected_sheet ?? '—'}</span>
              </div>
              <div className="bg-muted/30 rounded p-2">
                <span className="text-muted-foreground">Header row (0-based):</span>{' '}
                <span className="font-mono font-medium">{diagnostics.detected_header_row ?? '—'}</span>
              </div>
            </div>
            {diagnostics.all_sheets?.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                All sheets: {diagnostics.all_sheets.join(', ')}
              </p>
            )}
          </div>

          {/* Column mapping */}
          {diagnostics.column_mapping?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Recognized columns ({diagnostics.column_mapping.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {diagnostics.column_mapping.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    <span className="text-muted-foreground">{m.raw}</span>
                    <ArrowRight className="w-2.5 h-2.5 mx-1 opacity-50" />
                    <span className="font-mono text-primary">{m.field}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Unrecognized headers */}
          {diagnostics.unrecognized_headers?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Unrecognized columns ({diagnostics.unrecognized_headers.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {diagnostics.unrecognized_headers.map((h, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal text-muted-foreground">
                    {h}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Skip reason breakdown */}
          {Object.keys(skipReasons).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Skip reasons</p>
              <div className="space-y-1">
                {Object.entries(skipReasons)
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5">
                      <span className="text-muted-foreground">{SKIP_REASON_LABELS[key] ?? key}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* First 3 parsed rows */}
          {diagnostics.first_3_rows?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                First {diagnostics.first_3_rows.length} parsed rows
              </p>
              <div className="space-y-2">
                {diagnostics.first_3_rows.map((row, i) => (
                  <pre key={i} className="text-xs font-mono bg-muted/40 border border-border/40 rounded px-3 py-2 overflow-x-auto">
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))}
              </div>
            </div>
          )}

          {/* Skip details */}
          {diagnostics.first_10_skip_details?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Skip details (first {diagnostics.first_10_skip_details.length})
              </p>
              <div className="space-y-1">
                {diagnostics.first_10_skip_details.map((d, i) => (
                  <div key={i} className="text-xs font-mono bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                    Row {d.row}: {SKIP_REASON_LABELS[d.reason] ?? d.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save errors */}
          {diagnostics.first_10_save_errors?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Save errors (first {diagnostics.first_10_save_errors.length})
              </p>
              <div className="space-y-1">
                {diagnostics.first_10_save_errors.map((e, i) => (
                  <div key={i} className="text-xs font-mono bg-red-50 border border-red-100 rounded px-3 py-1.5">
                    Row {e.row}{e.company ? ` (${e.company})` : ''}: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Import() {
  const navigate = useNavigate();
  const { activeProject, activeProjectId, setActiveProjectId } = useActiveProject();

  const [destination, setDestination] = useState(activeProjectId ? 'active' : 'global');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [columnOverrides, setColumnOverrides] = useState({});
  const [summary, setSummary] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [errors, setErrors] = useState([]);
  const [stage, setStage] = useState('upload'); // upload | loading-preview | preview | importing | done
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => base44.entities.Project.list('-created_date', 200),
  });

  const resolvedProjectId = useMemo(() => {
    if (destination === 'active') return activeProjectId || null;
    if (destination === 'existing') return targetProjectId || null;
    return null;
  }, [destination, activeProjectId, targetProjectId]);

  const fileToBase64 = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });

  const handleFile = async (f) => {
    if (!f || !f.name.endsWith('.xlsx')) {
      setError('Please upload a valid .xlsx file');
      return;
    }
    setFile(f);
    setError(null);
    setStage('loading-preview');

    try {
      const fileBase64 = await fileToBase64(f);
      const res = await base44.functions.invoke('importExcel', {
        file_base64: fileBase64,
        filename: f.name,
        preview_only: true,
      });
      setPreview(res.data);
      setStage('preview');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to read file');
      setStage('upload');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    setStage('importing');
    setError(null);

    try {
      let projectIdForImport = resolvedProjectId;
      if (destination === 'new') {
        if (!newProjectName.trim()) {
          setError('Please enter a project name');
          setStage('preview');
          return;
        }
        const created = await base44.entities.Project.create({
          project_name: newProjectName.trim(),
          status: 'draft',
        });
        projectIdForImport = created.id;
        setActiveProjectId(created.id);
      }

      const fileBase64 = await fileToBase64(file);
      const activeOverrides = Object.fromEntries(
        Object.entries(columnOverrides).filter(([, v]) => v && v !== '_ignore')
      );
      const res = await base44.functions.invoke('importExcel', {
        file_base64: fileBase64,
        filename: file.name,
        preview_only: false,
        project_id: projectIdForImport || undefined,
        column_overrides: Object.keys(activeOverrides).length ? activeOverrides : undefined,
      });

      const data = res.data;
      const summ = data.summary ?? {};

      // Parse skip_reasons JSON if present
      let skipReasonsParsed = {};
      if (summ.skip_reasons && typeof summ.skip_reasons === 'string') {
        try { skipReasonsParsed = JSON.parse(summ.skip_reasons); } catch {}
      } else if (data.diagnostics?.skip_reasons) {
        skipReasonsParsed = data.diagnostics.skip_reasons;
      }

      setSummary({ ...summ, skip_reasons_parsed: skipReasonsParsed });
      setImportStatus(data.status || 'completed');
      setDiagnostics(data.diagnostics || null);
      setErrors(summ.error_details || []);
      setStage('done');
      qc.invalidateQueries();

      if (projectIdForImport && (summ.imported_rows ?? 0) + (summ.updated_rows ?? 0) > 0) {
        toast.success('Import complete — redirecting to project workspace');
        setTimeout(() => navigate(`/campaigns/${projectIdForImport}`), 1200);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Import failed');
      setStage('preview');
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setColumnOverrides({});
    setSummary(null);
    setImportStatus(null);
    setDiagnostics(null);
    setErrors([]);
    setStage('upload');
    setError(null);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">Import Excel</h1>
            <ProjectScopeBanner />
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">Upload your company leads .xlsx file</p>
        </div>
      </div>

      {/* Destination selector */}
      <Card className="mb-4 border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderKanban className="w-4 h-4" /> Import Destination
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeProject && (
              <button
                onClick={() => setDestination('active')}
                className={cn(
                  'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                  destination === 'active' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                )}
              >
                <FolderKanban className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Current project</p>
                  <p className="text-xs text-muted-foreground truncate">{activeProject.project_name}</p>
                </div>
              </button>
            )}
            <button
              onClick={() => setDestination('new')}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                destination === 'new' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              )}
            >
              <Plus className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Create new project</p>
                <p className="text-xs text-muted-foreground">Import into a brand new project</p>
              </div>
            </button>
            <button
              onClick={() => setDestination('existing')}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                destination === 'existing' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              )}
            >
              <FolderKanban className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Existing project</p>
                <p className="text-xs text-muted-foreground">Pick from your projects</p>
              </div>
            </button>
            <button
              onClick={() => setDestination('global')}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                destination === 'global' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              )}
            >
              <Globe className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Global database only</p>
                <p className="text-xs text-muted-foreground">No project linkage</p>
              </div>
            </button>
          </div>

          {destination === 'new' && (
            <div className="pt-2">
              <Label className="text-xs">New Project Name</Label>
              <Input
                placeholder="Q1 Outreach Campaign"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          )}
          {destination === 'existing' && (
            <div className="pt-2">
              <Label className="text-xs">Pick Project</Label>
              <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column reference */}
      <Card className="mb-6 border-blue-200 bg-blue-50/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <strong>Expected columns (any casing/synonym accepted):</strong>{' '}
              Company Name · CR Number · Category · Status · Primary Email · All Emails ·
              Primary Phone · All Phones · Website · LinkedIn · Source · Last Enriched
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload zone */}
      {(stage === 'upload' || stage === 'loading-preview') && (
        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-16 text-center transition-all cursor-pointer',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={e => handleFile(e.target.files[0])} />
          {stage === 'loading-preview'
            ? <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
            : <FileSpreadsheet className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />}
          <p className="font-semibold text-foreground mb-1">
            {stage === 'loading-preview' ? 'Reading file...' : 'Drop your Excel file here'}
          </p>
          <p className="text-sm text-muted-foreground">
            {stage === 'loading-preview' ? 'Please wait' : 'or click to browse · .xlsx only'}
          </p>
          {error && (
            <div className="mt-4 flex items-center gap-2 justify-center text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {stage === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">{file?.name}</h2>
              <p className="text-sm text-muted-foreground">
                {preview.total_rows} rows found · showing first {preview.preview?.length}
                {preview.detected_sheet && (
                  <span className="ml-2 text-muted-foreground/70">· Sheet: <span className="font-mono">{preview.detected_sheet}</span></span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={handleImport}>
                Import {preview.total_rows} Rows <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Column mapping badge strip */}
          {preview.column_mapping?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {preview.column_mapping.map((m, i) => (
                <Badge key={i} variant="outline" className="font-normal">
                  <span className="text-muted-foreground">{m.raw}</span>
                  <ArrowRight className="w-2.5 h-2.5 mx-1 opacity-40" />
                  <span className="font-mono text-primary">{m.field}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Warning + manual remap for unrecognized columns */}
          {preview.unrecognized_headers?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs font-medium text-amber-800">
                  {preview.recognized_count ?? preview.column_mapping?.length ?? 0} of {(preview.column_mapping?.length ?? 0) + preview.unrecognized_headers.length} columns recognized.
                  {' '}Map the remaining columns below to import their data.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {preview.unrecognized_headers.map(header => (
                  <div key={header} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-amber-700 truncate min-w-0 flex-1" title={header}>{header}</span>
                    <Select
                      value={columnOverrides[header] || '_ignore'}
                      onValueChange={v => setColumnOverrides(o => ({ ...o, [header]: v }))}
                    >
                      <SelectTrigger className="h-7 text-xs w-44 flex-shrink-0"><SelectValue placeholder="Ignore" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_ignore" className="text-xs text-muted-foreground">— Ignore —</SelectItem>
                        {MAPPABLE_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card className="border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {preview.headers?.map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview?.map((row, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      {preview.headers?.map(h => (
                        <td key={h} className="px-3 py-2 text-foreground max-w-[180px] truncate">
                          {row[h] ?? <span className="text-muted-foreground/50">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      )}

      {/* Importing spinner */}
      {stage === 'importing' && (
        <Card className="border-border/60 p-16 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
          <p className="font-semibold text-foreground mb-1">Importing companies...</p>
          <p className="text-sm text-muted-foreground">
            Deduplicating, validating, saving{resolvedProjectId || destination === 'new' ? ', and linking to project' : ''}
          </p>
        </Card>
      )}

      {/* Done */}
      {stage === 'done' && summary && (
        <div className="space-y-6">
          {/* Status banner — colour depends on actual outcome */}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <StatusBanner status={importStatus} summary={summary} />
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="mt-0.5 shrink-0">
              Import Another
            </Button>
          </div>

          {/* Summary grid */}
          <Card className="border-border/60">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Import Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {SUMMARY_FIELDS.map(({ key, label, color }) => (
                  <div key={key} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{summary[key] ?? 0}</p>
                  </div>
                ))}
              </div>

              {/* Detection info */}
              {(summary.detected_sheet || summary.detected_header_row != null) && (
                <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {summary.detected_sheet && (
                    <span>Sheet: <span className="font-mono text-foreground">{summary.detected_sheet}</span></span>
                  )}
                  {summary.detected_header_row != null && (
                    <span>Header row: <span className="font-mono text-foreground">{summary.detected_header_row}</span></span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error list */}
          {errors.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Row Errors ({errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs font-mono bg-red-50 border border-red-100 rounded px-3 py-2">
                      Row {e.row}: {e.error}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Diagnostics panel */}
          <DiagnosticsPanel diagnostics={diagnostics} summary={summary} />
        </div>
      )}
    </div>
  );
}
