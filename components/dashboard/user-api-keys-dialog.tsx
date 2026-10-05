'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  Key,
  ExternalLink,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Cpu,
  Loader2,
  Lock,
  Trash2,
} from 'lucide-react';

export interface KeysStatus {
  hasGemini: boolean;
  hasGrok: boolean;
  hasOpenai: boolean;
  hasAnyKey: boolean;
  preferredAiProvider: string;
  userApiKeyRequired: boolean;
}

interface ProviderRowProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  link: string;
  placeholder: string;
  configured: boolean;
  value: string;
  showValue: boolean;
  onToggleShow: () => void;
  onChange: (val: string) => void;
  onClear: () => void;
  onTest: () => void;
  testing: boolean;
  testResult?: { ok: boolean; message: string };
}

function ProviderRow({
  title,
  subtitle,
  icon,
  iconBg,
  link,
  placeholder,
  configured,
  value,
  showValue,
  onToggleShow,
  onChange,
  onClear,
  onTest,
  testing,
  testResult,
}: ProviderRowProps) {
  return (
    <div className="rounded-xl border border-border bg-card-2 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBg}`}>
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {configured ? (
                <Badge variant="success" className="text-[10px]">Configured</Badge>
              ) : (
                <Badge variant="muted" className="text-[10px]">Optional</Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          </div>
        </div>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Get API Key <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={showValue ? 'text' : 'password'}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pr-9 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        {value && (
          <Button type="button" variant="outline" size="xs" onClick={onClear} title="Clear key">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        )}
        <Button
          type="button"
          variant="subtle"
          size="xs"
          disabled={!value || testing}
          onClick={onTest}
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
        </Button>
      </div>
      {testResult && (
        <p className={`mt-1.5 text-[11px] ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {testResult.ok ? '✓' : '✗'} {testResult.message}
        </p>
      )}
    </div>
  );
}

export function UserApiKeysForm({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [status, setStatus] = React.useState<KeysStatus>({
    hasGemini: false,
    hasGrok: false,
    hasOpenai: false,
    hasAnyKey: false,
    preferredAiProvider: 'auto',
    userApiKeyRequired: false,
  });

  const [geminiKey, setGeminiKey] = React.useState('');
  const [grokKey, setGrokKey] = React.useState('');
  const [openaiKey, setOpenaiKey] = React.useState('');
  const [preferred, setPreferred] = React.useState('auto');

  const [showGemini, setShowGemini] = React.useState(false);
  const [showGrok, setShowGrok] = React.useState(false);
  const [showOpenai, setShowOpenai] = React.useState(false);

  const [testingProvider, setTestingProvider] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<Record<string, { ok: boolean; message: string }>>({});

  const fetchStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/user/ai-keys');
      if (res.ok) {
        const data: KeysStatus = await res.json();
        setStatus(data);
        setPreferred(data.preferredAiProvider || 'auto');
        if (data.hasGemini) setGeminiKey('••••••••••••••••');
        if (data.hasGrok) setGrokKey('••••••••••••••••');
        if (data.hasOpenai) setOpenaiKey('••••••••••••••••');
      }
    } catch (e) {
      console.error('Failed to load user keys status', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload: any = { preferredAiProvider: preferred };
      if (geminiKey && !geminiKey.startsWith('••••')) payload.geminiApiKey = geminiKey;
      else if (geminiKey === '') payload.geminiApiKey = '';
      if (grokKey && !grokKey.startsWith('••••')) payload.grokApiKey = grokKey;
      else if (grokKey === '') payload.grokApiKey = '';
      if (openaiKey && !openaiKey.startsWith('••••')) payload.openaiApiKey = openaiKey;
      else if (openaiKey === '') payload.openaiApiKey = '';

      const res = await fetch('/api/user/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setStatus(updated);
      toast({ title: 'API Keys saved securely', variant: 'success' });
      if (onSaved) onSaved();
    } catch (e: any) {
      toast({ title: 'Failed to save keys', description: e.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const testKey = async (provider: 'gemini' | 'grok' | 'openai') => {
    try {
      setTestingProvider(provider);
      let keyVal = provider === 'gemini' ? geminiKey : provider === 'grok' ? grokKey : openaiKey;
      const res = await fetch('/api/user/ai-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: keyVal && !keyVal.startsWith('••••') ? keyVal : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult((prev) => ({ ...prev, [provider]: { ok: true, message: `Connected! (${data.latencyMs}ms)` } }));
        toast({ title: `${provider.toUpperCase()} Connection Successful`, variant: 'success' });
      } else {
        setTestResult((prev) => ({ ...prev, [provider]: { ok: false, message: data.error || 'Failed' } }));
        toast({ title: `${provider.toUpperCase()} Test Failed`, description: data.error, variant: 'error' });
      }
    } catch (e: any) {
      setTestResult((prev) => ({ ...prev, [provider]: { ok: false, message: e.message } }));
    } finally {
      setTestingProvider(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {status.userApiKeyRequired && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">API Key Required: </span>
            The admin requires an API key to generate content. Please configure at least one key (Gemini, Grok, or OpenAI).
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 text-emerald-400" />
        <span>Keys are AES-256 encrypted at rest and never shared.</span>
      </div>

      <ProviderRow
        title="Google Gemini"
        subtitle="Gemini 3.8 Flash & 2.5 Flash"
        icon={<Sparkles className="h-4 w-4 text-blue-400" />}
        iconBg="bg-blue-500/10"
        link="https://aistudio.google.com/app/apikey"
        placeholder="AIzaSy..."
        configured={status.hasGemini}
        value={geminiKey}
        showValue={showGemini}
        onToggleShow={() => setShowGemini(!showGemini)}
        onChange={setGeminiKey}
        onClear={() => setGeminiKey('')}
        onTest={() => testKey('gemini')}
        testing={testingProvider === 'gemini'}
        testResult={testResult.gemini}
      />

      <ProviderRow
        title="xAI Grok"
        subtitle="Grok-2, Grok-Vision"
        icon={<Zap className="h-4 w-4 text-purple-400" />}
        iconBg="bg-purple-500/10"
        link="https://console.x.ai/"
        placeholder="xai-..."
        configured={status.hasGrok}
        value={grokKey}
        showValue={showGrok}
        onToggleShow={() => setShowGrok(!showGrok)}
        onChange={setGrokKey}
        onClear={() => setGrokKey('')}
        onTest={() => testKey('grok')}
        testing={testingProvider === 'grok'}
        testResult={testResult.grok}
      />

      <ProviderRow
        title="OpenAI"
        subtitle="GPT-4o, GPT-4o-mini"
        icon={<Cpu className="h-4 w-4 text-emerald-400" />}
        iconBg="bg-emerald-500/10"
        link="https://platform.openai.com/api-keys"
        placeholder="sk-..."
        configured={status.hasOpenai}
        value={openaiKey}
        showValue={showOpenai}
        onToggleShow={() => setShowOpenai(!showOpenai)}
        onChange={setOpenaiKey}
        onClear={() => setOpenaiKey('')}
        onTest={() => testKey('openai')}
        testing={testingProvider === 'openai'}
        testResult={testResult.openai}
      />

      <div className="rounded-xl border border-border bg-card-2 p-3.5">
        <label className="text-xs font-semibold text-foreground">Preferred AI Provider</label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Provider to prioritize for metadata generation.</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {['auto', 'gemini', 'grok', 'openai'].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreferred(id)}
              className={`flex items-center justify-center rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors ${
                preferred === id
                  ? 'border-accent bg-accent/15 text-accent font-semibold'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {id === 'auto' ? 'Auto' : id}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save API Keys'}
        </Button>
      </div>
    </div>
  );
}

export function UserApiKeysModal({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const show = open !== undefined ? open : isOpen;
  const setShow = onOpenChange || setIsOpen;

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Configure AI API Keys</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Use your own developer keys for unlimited speed and zero shared quotas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <UserApiKeysForm onSaved={() => {}} />
      </DialogContent>
    </Dialog>
  );
}
