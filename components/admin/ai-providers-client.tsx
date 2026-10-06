'use client';

import * as React from 'react';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Globe,
  Key,
  Cpu,
  Sparkles,
} from 'lucide-react';
import { TOOL_SLUGS, TOOL_META } from '@/lib/tools/slugs';

interface TestResult {
  ok: boolean;
  latencyMs: number;
  response: string;
  error?: string;
}

interface ProviderPreset {
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  apiType: string;
  description: string;
}

const PRESETS: ProviderPreset[] = [
  {
    id: 'groq',
    name: 'Groq (Ultra-fast LLaMA & Mixtral)',
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiType: 'openai',
    description: 'High-speed inference for LLaMA 3, Gemma, and Mistral.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (V3 & R1)',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    apiType: 'openai',
    description: 'Cost-effective high-reasoning models.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Unified Gateway)',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3.5-sonnet',
    apiType: 'openai',
    description: 'Access Claude, GPT-4, LLaMA, and 100+ models via one key.',
  },
  {
    id: 'together',
    name: 'Together AI',
    apiUrl: 'https://api.together.xyz/v1/chat/completions',
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    apiType: 'openai',
    description: 'Open-source foundation models at scale.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    apiUrl: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-large-latest',
    apiType: 'openai',
    description: 'European state-of-the-art open models.',
  },
  {
    id: 'ollama',
    name: 'Ollama / Local LLM',
    apiUrl: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3',
    apiType: 'openai',
    description: 'Run completely locally without external API charges.',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible Endpoint',
    apiUrl: 'https://api.example.com/v1/chat/completions',
    model: 'gpt-4o',
    apiType: 'openai',
    description: 'Any standard OpenAI chat completions endpoint.',
  },
];

// Available model options for major providers
const GEMINI_MODELS = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Fastest & Most Stable for Images)' },
  { value: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite Latest (Auto-updated Stable)' },
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Latest Preview)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemini-flash-latest', label: 'Gemini Flash Latest' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Cheaper)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Legacy)' },
];

export function AiProvidersClient({ configs: initialConfigs }: { configs: any[] }) {
  const toast = useToast();
  const [configs, setConfigs] = React.useState<any[]>(initialConfigs || []);
  const [editing, setEditing] = React.useState<Record<string, any>>({});
  const [testResults, setTestResults] = React.useState<Record<string, TestResult>>({});
  const [testing, setTesting] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = React.useState<Record<string, boolean>>({});
  const [keyEditing, setKeyEditing] = React.useState<Record<string, boolean>>({});

  // Add provider modal state
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<string>('groq');
  const [newProviderSlug, setNewProviderSlug] = React.useState<string>('groq');
  const [newApiKey, setNewApiKey] = React.useState<string>('');
  const [newModel, setNewModel] = React.useState<string>('llama-3.3-70b-versatile');
  const [newApiUrl, setNewApiUrl] = React.useState<string>(
    'https://api.groq.com/openai/v1/chat/completions',
  );
  const [isCreating, setIsCreating] = React.useState(false);

  // Routing state
  const initialMap = (configs.find((c: any) => c.isActiveForToolSlug) as any)
    ?.isActiveForToolSlug as Record<string, string> | null;
  const [routing, setRouting] = React.useState<Record<string, string>>(
    initialMap && typeof initialMap === 'object' ? initialMap : {},
  );
  const [routingOpen, setRoutingOpen] = React.useState(false);
  const [savingRouting, setSavingRouting] = React.useState(false);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) {
      if (presetId !== 'custom') {
        setNewProviderSlug(preset.id);
      }
      setNewModel(preset.model);
      setNewApiUrl(preset.apiUrl);
    }
  };

  const handleCreateCustomProvider = async () => {
    const slug = newProviderSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (!slug) {
      toast({ title: 'Provider identifier is required', variant: 'error' });
      return;
    }

    if (configs.some((c) => c.provider.toLowerCase() === slug)) {
      toast({ title: `Provider "${slug}" already exists`, variant: 'error' });
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        provider: slug,
        enabled: true,
        apiKey: newApiKey.trim() || undefined,
        modelDefault: newModel.trim() || 'gpt-3.5-turbo',
        customApiUrl: newApiUrl.trim(),
        apiType: 'openai',
        costPer1kIn: 0,
        costPer1kOut: 0,
        maxTokens: 2048,
        priority: 10,
      };

      const res = await fetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create provider');
      }

      const saved = await res.json();
      // Clear apiKey string; rely on hasKey boolean from server response for UI state
      setConfigs((prev) => [...prev.filter((c) => c.provider !== slug), { ...saved, apiKey: '', hasKey: !!saved.hasKey }]);
      setIsAddModalOpen(false);
      setNewApiKey('');
      toast({
        title: `Provider "${slug}" created successfully`,
        description: 'You can now test connectivity or assign it to tools.',
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to create provider',
        description: err.message || 'An error occurred',
        variant: 'error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const testProvider = async (provider: string) => {
    setTesting({ ...testing, [provider]: true });
    setTestResults({ ...testResults, [provider]: undefined as any });

    try {
      const res = await fetch('/api/admin/ai-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const result = await res.json();
      setTestResults({ ...testResults, [provider]: result });

      if (result.ok) {
        toast({
          title: `${provider} test passed`,
          description: `Response in ${result.latencyMs}ms`,
          variant: 'success',
        });
      } else {
        toast({
          title: `${provider} test failed`,
          description: result.error,
          variant: 'error',
        });
      }
    } catch (err: any) {
      const errorResult = {
        ok: false,
        latencyMs: 0,
        response: '',
        error: err.message || 'Network error',
      };
      setTestResults({ ...testResults, [provider]: errorResult });
      toast({ title: 'Test failed', description: err.message, variant: 'error' });
    } finally {
      setTesting({ ...testing, [provider]: false });
    }
  };

  const saveProvider = async (provider: string) => {
    const current = configs.find((c) => c.provider === provider) || { provider };
    const draft = editing[provider] || current;

    // Build clean payload with only the fields the API expects
    // Never spread the entire draft object (contains hasKey, id, createdAt, etc.)
    const rawKey = String(draft.apiKey ?? '').trim();
    const payload: any = {
      provider,
      enabled: draft.enabled,
      // Only send apiKey if user entered a new value (not empty/sentinel)
      ...(rawKey && rawKey !== 'configured' && !rawKey.startsWith('••••') ? { apiKey: rawKey } : {}),
      modelDefault: draft.modelDefault,
      customApiUrl: draft.customApiUrl,
      customHeaders: draft.customHeaders,
      apiType: draft.apiType,
      costPer1kIn: draft.costPer1kIn,
      costPer1kOut: draft.costPer1kOut,
      maxTokens: draft.maxTokens,
      priority: draft.priority,
    };
    // Only include routing if this save is specifically for routing changes
    // (routing is handled separately via saveRoutingMap)

    setSaving((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }

      const saved = await res.json();
      // Keep hasKey from server response; clear apiKey so the input stays blank
      // (the placeholder "••••••••" signals a key is stored when hasKey is true)
      setConfigs((prev) => {
        const exists = prev.some((c) => c.provider === provider);
        if (exists) {
          return prev.map((c) =>
            c.provider === provider
              ? { ...c, ...saved, apiKey: '', hasKey: !!saved.hasKey }
              : c
          );
        }
        return [...prev, { ...saved, apiKey: '', hasKey: !!saved.hasKey }];
      });

      setEditing((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      setKeyEditing((prev) => ({ ...prev, [provider]: false }));

      toast({
        title: `${provider} configuration saved`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err.message || 'Could not update provider configuration',
        variant: 'error',
      });
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const deleteProvider = async (provider: string) => {
    if (!confirm(`Are you sure you want to delete the custom provider "${provider}"?`)) {
      return;
    }

    setDeleting((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch(`/api/admin/ai-providers?provider=${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete failed');
      }

      setConfigs((prev) => prev.filter((c) => c.provider !== provider));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });

      setRouting((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [tool, p] of Object.entries(next)) {
          if (p === provider) {
            delete next[tool];
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      toast({
        title: `Provider "${provider}" deleted`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err.message || 'Could not delete provider',
        variant: 'error',
      });
    } finally {
      setDeleting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const saveRoutingMap = async () => {
    setSavingRouting(true);
    try {
      const primary = configs.find((c) => c.provider === 'gemini') || configs[0];
      const res = await fetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: primary ? primary.provider : 'gemini',
          isActiveForToolSlug: routing,
        }),
      });

      if (!res.ok) throw new Error('Failed to save routing map');

      toast({
        title: 'Routing map saved',
        description: 'Tool requests will now route to their assigned AI providers.',
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to save routing',
        description: err.message || 'Unknown error',
        variant: 'error',
      });
    } finally {
      setSavingRouting(false);
    }
  };

  const displayConfigs = React.useMemo(() => {
    const list = [...configs];
    if (!list.some((c) => c.provider === 'gemini')) {
      list.unshift({
        provider: 'gemini',
        enabled: true,
        modelDefault: 'gemini-3.5-flash-lite',
        costPer1kIn: 0.00015,
        costPer1kOut: 0.0006,
        maxTokens: 2048,
        priority: 100,
        hasKey: false,
      });
    }
    if (!list.some((c) => c.provider === 'openai')) {
      list.push({
        provider: 'openai',
        enabled: false,
        modelDefault: 'gpt-4o',
        costPer1kIn: 0.005,
        costPer1kOut: 0.015,
        maxTokens: 2048,
        priority: 50,
        hasKey: false,
      });
    }
    return list;
  }, [configs]);

  const providerSlugs = displayConfigs.map((c) => c.provider);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              AI Providers
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
              Provider Configuration
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Active provider selection is stored in the database — no env changes needed.
            </p>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            variant="default"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Custom Provider
          </Button>
        </div>
        <div className="space-y-4">
          <Card className="border-accent/40 bg-card shadow-sm">
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">Adobe Stock Scraper (Apify Engine)</h3>
                    <Badge variant="outline" className="text-xs">Market Intelligence</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure Apify API token and Actor settings for live Adobe Stock analytics &amp; search.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0 border-accent/40 text-accent hover:bg-accent hover:text-accent-foreground"
                asChild
              >
                <a href="/admin/settings">
                  Configure in Settings &rarr;
                </a>
              </Button>
            </CardContent>
          </Card>

          {displayConfigs.map((cfg) => {
          const p = cfg.provider;
          const e = editing[p] || cfg;
          const isDefaultProvider = p === 'gemini' || p === 'openai';
          const isTesting = !!testing[p];
          const isSaving = !!saving[p];
          const isDeleting = !!deleting[p];
          const testRes = testResults[p];
          // hasKey is set by listProviderConfigs / POST response — never rely on apiKey string value
          // since we always clear it to '' on the client to avoid sending stale encrypted blobs
          const hasKey = !!(cfg.hasKey || (cfg.apiKey && cfg.apiKey !== '' && cfg.apiKey !== 'configured'));

          return (
            <Card key={p}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="capitalize">{p}</CardTitle>
                    <Badge
                      variant={e.enabled ? 'success' : 'muted'}
                      className="flex items-center gap-1"
                    >
                      {e.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {e.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                    {!isDefaultProvider && (
                      <Badge variant="outline" className="text-xs">Custom</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testProvider(p)}
                      disabled={isTesting || !hasKey}
                      className="h-8 gap-1.5"
                    >
                      {isTesting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      Test
                    </Button>
                    {!isDefaultProvider && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProvider(p)}
                        disabled={isDeleting}
                        className="h-8 px-2 text-destructive hover:bg-destructive/10"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <CardDescription>Default model: {e.modelDefault || '—'}</CardDescription>
                  {testRes && (
                    <div
                      className={`flex items-center gap-2 text-sm ${testRes.ok ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {testRes.ok ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Test passed • {testRes.latencyMs}ms latency</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          <span className="line-clamp-1">
                            {testRes.error || 'Test failed'}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Toggle
                    label="Enabled"
                    checked={!!e.enabled}
                    onChange={(v) => setEditing({ ...editing, [p]: { ...e, enabled: v } })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    API key
                  </label>
                  {/* Show masked dots when a key exists and user hasn't started editing */}
                  {hasKey && !keyEditing[p] ? (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 font-mono text-sm tracking-widest text-green-700 dark:text-green-400">
                        ••••••••••••••••
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setKeyEditing({ ...keyEditing, [p]: true })}
                        className="shrink-0"
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="password"
                      value={e.apiKey || ''}
                      onChange={(ev) =>
                        setEditing({ ...editing, [p]: { ...e, apiKey: ev.target.value } })
                      }
                      placeholder={hasKey ? 'Enter new key to replace existing…' : 'sk-...'}
                      className="mt-1"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Default model
                  </label>
                  {p === 'gemini' ? (
                    <select
                      value={e.modelDefault && e.modelDefault !== 'gemini-2.0-flash' ? e.modelDefault : 'gemini-3.5-flash-lite'}
                      onChange={(ev) =>
                        setEditing({ ...editing, [p]: { ...e, modelDefault: ev.target.value } })
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {GEMINI_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  ) : p === 'openai' ? (
                    <select
                      value={e.modelDefault || 'gpt-4o'}
                      onChange={(ev) =>
                        setEditing({ ...editing, [p]: { ...e, modelDefault: ev.target.value } })
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {OPENAI_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={e.modelDefault || ''}
                      onChange={(ev) =>
                        setEditing({ ...editing, [p]: { ...e, modelDefault: ev.target.value } })
                      }
                      className="mt-1"
                      placeholder="e.g., llama-3.3-70b-versatile"
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cost / 1k input (USD)
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={e.costPer1kIn}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        [p]: { ...e, costPer1kIn: Number(ev.target.value) },
                      })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cost / 1k output (USD)
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={e.costPer1kOut}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        [p]: { ...e, costPer1kOut: Number(ev.target.value) },
                      })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Max tokens
                  </label>
                  <Input
                    type="number"
                    value={e.maxTokens}
                    onChange={(ev) =>
                      setEditing({ ...editing, [p]: { ...e, maxTokens: Number(ev.target.value) } })
                    }
                    className="mt-1"
                  />
                </div>

                {/* Custom Provider Fields - Show only for non-standard providers */}
                {!['gemini', 'openai'].includes(p) && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Custom API URL
                      </label>
                      <Input
                        value={e.customApiUrl || ''}
                        onChange={(ev) =>
                          setEditing({ ...editing, [p]: { ...e, customApiUrl: ev.target.value } })
                        }
                        placeholder="https://api.example.com/v1/chat/completions"
                        className="mt-1"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Full endpoint URL for OpenAI-compatible APIs
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        API Format Type
                      </label>
                      <select
                        value={e.apiType || 'openai'}
                        onChange={(ev) =>
                          setEditing({ ...editing, [p]: { ...e, apiType: ev.target.value } })
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="openai">OpenAI Compatible</option>
                        <option value="gemini">Gemini Compatible</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Priority (0-100)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={e.priority || 0}
                        onChange={(ev) =>
                          setEditing({ ...editing, [p]: { ...e, priority: Number(ev.target.value) } })
                        }
                        className="mt-1"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Higher priority = tried first in failover
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Custom Headers (JSON)
                      </label>
                      <textarea
                        value={
                          typeof e.customHeaders === 'string'
                            ? e.customHeaders
                            : JSON.stringify(e.customHeaders || {}, null, 2)
                        }
                        onChange={(ev) => {
                          try {
                            const parsed = JSON.parse(ev.target.value);
                            setEditing({ ...editing, [p]: { ...e, customHeaders: parsed } });
                          } catch {
                            // Keep raw string if invalid JSON
                            setEditing({ ...editing, [p]: { ...e, customHeaders: ev.target.value } });
                          }
                        }}
                        placeholder='{"X-Custom-Header": "value"}'
                        className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Optional custom headers (e.g., {`{"anthropic-version": "2023-06-01"}`})
                      </p>
                    </div>
                  </>
                )}

                <div className="flex items-end sm:col-span-2">
                  <Button
                    className="w-full"
                    onClick={() => saveProvider(p)}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Per-tool routing map (PROMPT 12 / PROMPT 9.6) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Per-tool routing</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setRoutingOpen((v) => !v)}
              >
                {routingOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
            <CardDescription>
              Override the active provider for individual tools. Leave a tool unset to fall back to
              the globally-active provider. Changes take effect on the next generation call — no
              deploy required.
            </CardDescription>
          </CardHeader>
          {routingOpen && (
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TOOL_SLUGS.map((slug) => (
                  <div
                    key={slug}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{TOOL_META[slug].title}</p>
                      <p className="truncate text-xs text-muted-foreground">{slug}</p>
                    </div>
                    <select
                      className="h-8 shrink-0 rounded-md border bg-background px-2 text-xs"
                      value={routing[slug] || ''}
                      onChange={(ev) =>
                        setRouting((r) => {
                          const next = { ...r };
                          if (ev.target.value) next[slug] = ev.target.value;
                          else delete next[slug];
                          return next;
                        })
                      }
                    >
                      <option value="">Default</option>
                      {providerSlugs.map((pp) => (
                        <option key={pp} value={pp} className="capitalize">
                          {pp}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  onClick={saveRoutingMap}
                  disabled={savingRouting}
                >
                  {savingRouting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save routing map
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
        </div>
      </div>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add AI Provider
            </DialogTitle>
            <DialogDescription>
              Choose a popular preset or enter custom OpenAI-compatible API details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Preset
              </label>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset.id)}
                    className={`flex items-start justify-between rounded-lg border p-2 text-left transition-all text-xs ${
                      selectedPreset === preset.id
                        ? 'border-primary bg-primary/5 text-foreground font-medium'
                        : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{preset.name}</div>
                      <div className="text-[11px] text-muted-foreground">{preset.description}</div>
                    </div>
                    {selectedPreset === preset.id && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Provider Identifier / Slug
              </label>
              <Input
                value={newProviderSlug}
                onChange={(ev) => setNewProviderSlug(ev.target.value)}
                placeholder="e.g. groq, deepseek, openrouter"
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API Key
              </label>
              <Input
                type="password"
                value={newApiKey}
                onChange={(ev) => setNewApiKey(ev.target.value)}
                placeholder="gsk-... or sk-or-..."
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Default Model
              </label>
              <Input
                value={newModel}
                onChange={(ev) => setNewModel(ev.target.value)}
                placeholder="e.g. llama-3.3-70b-versatile"
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                API Endpoint URL
              </label>
              <Input
                value={newApiUrl}
                onChange={(ev) => setNewApiUrl(ev.target.value)}
                placeholder="https://api.groq.com/openai/v1/chat/completions"
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCustomProvider}
              disabled={isCreating || !newProviderSlug.trim()}
              className="gap-2"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create Provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
