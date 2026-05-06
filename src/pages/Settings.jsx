import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getOllamaModels } from '@/api/localClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon, Save, RefreshCw, CheckCircle2,
  AlertCircle, Loader2, Zap, Mail, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOCAL_API = import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3001';

const DEFAULTS = {
  test_mode: true,
  daily_email_limit: 50,
  max_emails_per_hour: 10,
  sending_window_start: '09:00',
  sending_window_end: '17:00',
  ollama_base_url: 'http://localhost:11434',
  ollama_model: '',
  smtp_from_name: 'RFxAI Outreach',
  smtp_from_email: '',
};

function StatusDot({ status }) {
  const map = {
    online:          'bg-green-500',
    connected:       'bg-green-500',
    offline:         'bg-gray-400',
    not_configured:  'bg-amber-400',
    error:           'bg-red-500',
    checking:        'bg-blue-400 animate-pulse',
  };
  return <span className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', map[status] || 'bg-gray-400')} />;
}

function StatusLabel({ status, extra }) {
  const labels = {
    online:          'Online',
    connected:       'Connected',
    offline:         'Offline',
    not_configured:  'Not configured',
    error:           'Error',
    checking:        'Checking…',
  };
  return (
    <span className={cn('text-xs font-medium',
      ['online', 'connected'].includes(status) ? 'text-green-700' :
      status === 'not_configured' ? 'text-amber-700' :
      status === 'error' ? 'text-red-600' : 'text-muted-foreground'
    )}>
      {labels[status] || status}{extra ? ` — ${extra}` : ''}
    </span>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ollama state
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaError, setOllamaError] = useState('');
  const [ollamaChecking, setOllamaChecking] = useState(false);

  // Email / backend state
  const [backendStatus, setBackendStatus] = useState('checking');
  const [emailStatus, setEmailStatus] = useState('checking');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestMsg, setEmailTestMsg] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await base44.functions.invoke('appSettings', { action: 'get' });
      if (res.data?.settings) setSettings({ ...DEFAULTS, ...res.data.settings });
    } catch {}
    setLoading(false);
  };

  const checkOllama = useCallback(async (baseUrl) => {
    const url = baseUrl || settings.ollama_base_url || 'http://localhost:11434';
    setOllamaStatus('checking');
    setOllamaChecking(true);
    setOllamaError('');
    const result = await getOllamaModels(url);
    if (result.models.length > 0) {
      setOllamaStatus('online');
      setOllamaModels(result.models);
    } else {
      setOllamaStatus('offline');
      setOllamaError(result.error || 'No models found');
    }
    setOllamaChecking(false);
  }, [settings.ollama_base_url]);

  const checkEmail = useCallback(async () => {
    setEmailTesting(true);
    setEmailTestMsg('');
    // First check if backend is running
    try {
      const hRes = await fetch(`${LOCAL_API}/health`, { signal: AbortSignal.timeout(5000) });
      if (!hRes.ok) throw new Error('Backend returned error');
      const hData = await hRes.json();
      setBackendStatus('online');
      if (hData.email_status === 'connected') {
        setEmailStatus('connected');
        setEmailFrom(hData.smtp_from || '');
        setEmailTestMsg(`SMTP connected. Sending from: ${hData.smtp_from}`);
      } else if (hData.smtp_configured) {
        setEmailStatus('error');
        setEmailTestMsg('SMTP configured but connection failed. Check credentials.');
      } else {
        setEmailStatus('not_configured');
        setEmailTestMsg('SMTP not configured. Add credentials to backend/.env');
      }
    } catch {
      setBackendStatus('offline');
      setEmailStatus('not_configured');
      setEmailTestMsg('Backend service not running. Start with: cd backend && npm install && npm start');
    }
    setEmailTesting(false);
  }, []);

  useEffect(() => {
    checkOllama();
    checkEmail();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('appSettings', { action: 'update', settings });
      toast.success('Settings saved');
      // Re-check Ollama with potentially updated URL/model
      checkOllama(settings.ollama_base_url);
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  const selectedModelExists = settings.ollama_model && ollamaModels.includes(settings.ollama_model);
  const modelMissing = settings.ollama_model && ollamaStatus === 'online' && !selectedModelExists;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {/* ─── Ollama / AI Generation ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-600" /> AI Generation (Ollama)
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <StatusDot status={ollamaStatus} />
              <StatusLabel
                status={ollamaStatus}
                extra={ollamaStatus === 'online' ? `${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''}` : ollamaError || undefined}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Base URL */}
          <div className="space-y-1.5">
            <Label className="text-sm">Ollama Base URL</Label>
            <div className="flex gap-2">
              <Input
                value={settings.ollama_base_url}
                onChange={e => setSettings(s => ({ ...s, ollama_base_url: e.target.value }))}
                placeholder="http://localhost:11434"
                className="flex-1 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkOllama(settings.ollama_base_url)}
                disabled={ollamaChecking}
                className="gap-1.5 shrink-0"
              >
                {ollamaChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Make sure Ollama is running locally. Install: <span className="font-mono">ollama pull llama3</span></p>
          </div>

          {/* Model selector */}
          <div className="space-y-1.5">
            <Label className="text-sm">Selected Model</Label>
            {ollamaStatus === 'online' && ollamaModels.length > 0 ? (
              <Select
                value={settings.ollama_model || '__auto'}
                onValueChange={v => setSettings(s => ({ ...s, ollama_model: v === '__auto' ? '' : v }))}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Auto-select best available" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto" className="text-xs text-muted-foreground">Auto-select best available</SelectItem>
                  {ollamaModels.map(m => (
                    <SelectItem key={m} value={m} className="text-sm font-mono">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={settings.ollama_model}
                onChange={e => setSettings(s => ({ ...s, ollama_model: e.target.value }))}
                placeholder="e.g. llama3 (leave blank for auto)"
                className="font-mono text-sm"
              />
            )}
            {modelMissing && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5" />
                Model <span className="font-mono">{settings.ollama_model}</span> not found.
                Install it with: <span className="font-mono">ollama pull {settings.ollama_model}</span>
              </div>
            )}
            {ollamaStatus === 'online' && !settings.ollama_model && (
              <p className="text-xs text-green-700">Will auto-select best available model ({ollamaModels[0]})</p>
            )}
          </div>

          {ollamaStatus === 'offline' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-medium mb-1">Ollama is not reachable</p>
              <p>1. Install Ollama: <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a></p>
              <p>2. Pull a model: <span className="font-mono">ollama pull llama3</span></p>
              <p>3. Ollama starts automatically. Click Test to verify.</p>
              <p className="mt-1 text-amber-700">Without Ollama, the app uses built-in email templates instead of AI-generated content.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Email Provider ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" /> Email Provider (SMTP)
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <StatusDot status={emailStatus === 'checking' ? 'checking' : emailStatus} />
              <StatusLabel
                status={emailStatus === 'checking' ? 'checking' : emailStatus}
                extra={emailFrom || undefined}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Backend service</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusDot status={backendStatus === 'checking' ? 'checking' : backendStatus} />
                <span className="text-xs text-muted-foreground">
                  {backendStatus === 'online' ? `Running at ${LOCAL_API}` :
                   backendStatus === 'offline' ? `Not running at ${LOCAL_API}` : 'Checking…'}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={checkEmail}
              disabled={emailTesting}
              className="gap-1.5"
            >
              {emailTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Test Connection
            </Button>
          </div>

          {emailTestMsg && (
            <div className={cn(
              'flex items-start gap-2 text-xs rounded-lg p-3 border',
              emailStatus === 'connected' ? 'bg-green-50 border-green-200 text-green-800' :
              emailStatus === 'not_configured' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-red-50 border-red-200 text-red-800'
            )}>
              {emailStatus === 'connected'
                ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              <p>{emailTestMsg}</p>
            </div>
          )}

          <div className="bg-muted/40 border border-border/60 rounded-lg p-4 text-xs space-y-2">
            <p className="font-medium text-foreground">Configure SMTP credentials</p>
            <p className="text-muted-foreground">
              Email credentials are kept secure in the backend service — never in the browser.
              To configure:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Copy <span className="font-mono">.env.example</span> → <span className="font-mono">backend/.env</span></li>
              <li>Fill in <span className="font-mono">SMTP_HOST</span>, <span className="font-mono">SMTP_USER</span>, <span className="font-mono">SMTP_PASS</span></li>
              <li>Start backend: <span className="font-mono">cd backend && npm install && npm start</span></li>
              <li>Click "Test Connection" above to verify</li>
            </ol>
            <p className="text-muted-foreground pt-1">
              Gmail: use an App Password (Google Account → Security → 2-Step → App passwords)
            </p>
          </div>

          {/* Sender display name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Sender Name</Label>
              <Input
                value={settings.smtp_from_name}
                onChange={e => setSettings(s => ({ ...s, smtp_from_name: e.target.value }))}
                placeholder="RFxAI Outreach"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Sender Email (display)</Label>
              <Input
                value={settings.smtp_from_email}
                onChange={e => setSettings(s => ({ ...s, smtp_from_email: e.target.value }))}
                placeholder="your@email.com"
                type="email"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Rate Limits & Sending Window ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" /> Rate Limits & Sending Window
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Test Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Simulate sends without sending real emails. Enable this until SMTP is configured and verified.</p>
            </div>
            <Switch
              checked={!!settings.test_mode}
              onCheckedChange={(v) => setSettings(s => ({ ...s, test_mode: v }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Max emails / hour</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={settings.max_emails_per_hour}
                onChange={e => setSettings(s => ({ ...s, max_emails_per_hour: parseInt(e.target.value) || 10 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Daily email limit</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={settings.daily_email_limit}
                onChange={e => setSettings(s => ({ ...s, daily_email_limit: parseInt(e.target.value) || 50 }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Sending window start</Label>
              <Input
                type="time"
                value={settings.sending_window_start}
                onChange={e => setSettings(s => ({ ...s, sending_window_start: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Sending window end</Label>
              <Input
                type="time"
                value={settings.sending_window_end}
                onChange={e => setSettings(s => ({ ...s, sending_window_end: e.target.value }))}
              />
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
            Safe defaults: 10/hour · 50/day · 09:00–17:00. These protect your sender reputation.
            Real emails will not send outside the window or after limits are reached.
            Simulated sends always work regardless of limits.
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}
