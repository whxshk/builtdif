import { useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, X,
  Loader2, Info, FolderKanban, Globe, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useActiveProject } from '@/lib/ProjectContext';
import ProjectScopeBanner from '@/components/ProjectScopeBanner';

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

export default function Import() {
  const navigate = useNavigate();
  const { activeProject, activeProjectId, setActiveProjectId } = useActiveProject();

  // Destination: 'active' (use selected project), 'existing' (pick another), 'new' (create), 'global'
  const [destination, setDestination] = useState(activeProjectId ? 'active' : 'global');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
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

  // Resolve which project (if any) to import into
  const resolvedProjectId = useMemo(() => {
    if (destination === 'active') return activeProjectId || null;
    if (destination === 'existing') return targetProjectId || null;
    return null; // 'new' is created at submit time, 'global' is null
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
      const res = await base44.functions.invoke('importExcel', { file_base64: fileBase64, filename: f.name, preview_only: true });
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
      // If creating a new project, do it first
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
      const res = await base44.functions.invoke('importExcel', {
        file_base64: fileBase64,
        filename: file.name,
        preview_only: false,
        project_id: projectIdForImport || undefined,
      });
      setSummary(res.data.summary);
      setErrors(res.data.summary?.error_details || []);
      setStage('done');
      qc.invalidateQueries();

      if (projectIdForImport) {
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
    setSummary(null);
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
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Choose a project..." /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
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
              <strong>Expected columns:</strong> Company Name · CR Number · Category · Status · Primary Email · All Emails · Primary Phone · All Phones · Website · LinkedIn · Source · Last Enriched
            </div>
          </div>
        </CardContent>
      </Card>

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
          <p className="text-sm text-muted-foreground">{stage === 'loading-preview' ? 'Please wait' : 'or click to browse · .xlsx only'}</p>
          {error && (
            <div className="mt-4 flex items-center gap-2 justify-center text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">{file?.name}</h2>
              <p className="text-sm text-muted-foreground">{preview.total_rows} rows found · showing first {preview.preview?.length}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={handleImport}>
                Import {preview.total_rows} Rows <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

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

      {stage === 'importing' && (
        <Card className="border-border/60 p-16 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
          <p className="font-semibold text-foreground mb-1">Importing companies...</p>
          <p className="text-sm text-muted-foreground">Deduplicating, validating, saving{resolvedProjectId || destination === 'new' ? ', and linking to project' : ''}</p>
        </Card>
      )}

      {stage === 'done' && summary && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Import completed</p>
              <p className="text-sm text-green-700">{summary.imported_rows} new companies saved · {summary.updated_rows} updated</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={reset}>Import Another</Button>
          </div>

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
            </CardContent>
          </Card>

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
        </div>
      )}
    </div>
  );
}