'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ApiKeyRequiredDialog } from '@/components/dashboard/api-key-required-dialog';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ControlsRail } from '@/components/dashboard/generator/controls-rail';
import {
  Copy,
  Check,
  Sparkles,
  Download,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  Trash2,
  RotateCcw,
  Image as ImageIcon,
  Upload,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import {
  buildPromptExport,
  promptExportFilename,
  type PromptExportFormat,
} from '@/lib/prompt-styles/export';

interface Props {
  batchLimit: number;
  costPerImage: number;
  userId: string;
  activeTab?: 'metadata' | 'prompt';
  onTabChange?: (tab: 'metadata' | 'prompt') => void;
  user?: { id: string; email: string; name: string | null; preferredAiProvider?: string };
}

interface ResultRow {
  id: string;
  fileName: string;
  styleLabel: string;
  status: 'complete' | 'failed';
  prompt: string;
  subject?: string;
  style?: string;
  lighting?: string;
  composition?: string;
  mood?: string;
  error?: string;
}

export function ImageToPrompt({ batchLimit, costPerImage, userId, activeTab, onTabChange, user }: Props) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [style, setStyle] = React.useState('');
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<PromptExportFormat>('csv');
  const [dropzoneExpanded, setDropzoneExpanded] = React.useState(true);

  const toast = useToast();
  const { credits, unlimited } = useCredits();
  const queryClient = useQueryClient();

  const { data: styles } = useQuery({
    queryKey: ['prompt-styles'],
    queryFn: async () => {
      const res = await fetch('/api/prompt-styles');
      if (!res.ok) throw new Error('styles_failed');
      return res.json();
    },
  });

  // Default to the first available preset once the list loads.
  React.useEffect(() => {
    if (!style && styles?.length) setStyle(styles[0].slug);
  }, [styles, style]);

  // Restore the last-used style for this user.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`image-prompt-style:${userId}`);
      if (saved) setStyle(saved);
    } catch {
      /* ignore */
    }
  }, [userId]);

  const onStyleChange = (v: string) => {
    setStyle(v);
    try {
      localStorage.setItem(`image-prompt-style:${userId}`, v);
    } catch {
      /* ignore */
    }
  };

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  const [generatingIds, setGeneratingIds] = React.useState<Set<string>>(new Set());
  const [regeneratingIds, setRegeneratingIds] = React.useState<Set<string>>(new Set());
  const abortRef = React.useRef<AbortController | null>(null);

  // Abort any in-flight generation if the component unmounts mid-stream.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startStreamingGeneration() {
    // Only send images that don't already have results — prevents double-charging
    // when user clicks Generate multiple times.
    const ready = files.filter(
      (f) =>
        f.status === 'done' &&
        (f.previewUrl || f.dataUrl) &&
        !results.find((r) => r.id === f.id)
    );
    if (ready.length === 0) {
      toast({ title: 'No new images to process', description: 'All uploaded images already have prompts. Upload new images or remove existing results to regenerate.', variant: 'info' });
      return;
    }
    if (!style) {
      toast({ title: 'No style selected', description: 'Select a prompt style first', variant: 'error' });
      return;
    }

    const totalCost = ready.length * costPerImage;
    if (!unlimited && credits < totalCost) {
      toast({
        title: 'Insufficient credits',
        description: `You need ${totalCost} credits but have ${credits}.`,
        variant: 'error',
      });
      return;
    }

    setIsGenerating(true);
    setGeneratingIds(new Set(ready.map((f) => f.id)));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/generate/image-prompt/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          style,
          images: ready.map((f) => ({
            id: f.id,
            fileName: f.name,
            key: f.key,
            previewUrl: f.previewUrl || f.dataUrl,
            mimeType: f.mimeType || f.type,
          })),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Generation failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            // Parse separately so a backend 'error' event thrown below
            // propagates to the outer catch (toast) instead of being
            // swallowed here as a parse warning.
            let data: any;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              console.warn('Failed to parse SSE data:', line);
              continue;
            }

            if (data.type === 'start') {
              toast({ title: `Synthesizing prompts for ${data.total} images`, variant: 'info' });
            } else if (data.type === 'processing') {
              // Image is being processed
            } else if (data.type === 'result') {
                const result = data.result;
                setResults((prev) => {
                  const existing = prev.find((r) => r.id === result.id);
                  if (existing) {
                    return prev.map((r) => (r.id === result.id ? result : r));
                  }
                  return [...prev, result];
                });
                setGeneratingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(result.id);
                  return next;
                });
              } else if (data.type === 'done') {
                setIsGenerating(false);
                setGeneratingIds(new Set());
                queryClient.invalidateQueries({ queryKey: ['credits'] });
                
                if (data.failed > 0) {
                  // The backend reports `refunded` even in unlimited mode, where
                  // nothing was actually deducted — only mention the refund then.
                  const refundedText =
                    !unlimited && data.refunded > 0
                      ? ` — ${data.refunded} credit${data.refunded === 1 ? '' : 's'} refunded automatically`
                      : '';
                  toast({
                    title: `${data.succeeded}/${data.succeeded + data.failed} prompts generated`,
                    description: `${data.failed} failed${refundedText}.`,
                    variant: 'warning',
                  });
                } else {
                  toast({ title: 'Prompts generated', variant: 'success' });
                }
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Generation failed');
              }
          }
        }
      }
    } catch (error: any) {
      // Aborted (unmount / Clear All) — not a real failure, stay silent.
      if (error?.name !== 'AbortError' && !controller.signal.aborted) {
        // API key required → show the add-key popup instead of a generic toast.
        // The backend may return {"error":"user_api_key_required",...} as a raw
        // JSON string, or as an SSE event: data: {"type":"error","error":...}.
        let isApiKeyError = error.message === 'user_api_key_required';
        if (!isApiKeyError && typeof error.message === 'string') {
          try {
            let text = error.message.trim();
            if (text.startsWith('data:')) text = text.slice(5).trim();
            const parsed = JSON.parse(text);
            isApiKeyError = parsed?.error === 'user_api_key_required';
          } catch { /* not JSON — leave as-is */ }
        }
        if (isApiKeyError) {
          setApiKeyDialogOpen(true);
        } else {
          toast({
            title: 'Generation failed',
            description: error.message || 'Unknown error',
            variant: 'error'
          });
        }
      }
    } finally {
      // Always reset loading state — the stream may end without a 'done'
      // event (e.g. server timeout), which would otherwise hang the UI forever.
      setIsGenerating(false);
      setGeneratingIds(new Set());
      if (abortRef.current === controller) abortRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }

  async function regenerateSingle(id: string) {
    const file = files.find(f => f.id === id);
    if (!file || (!file.previewUrl && !file.dataUrl)) {
      toast({ title: 'File not found', description: 'Cannot regenerate this prompt', variant: 'error' });
      return;
    }
    
    if (!unlimited && credits < costPerImage) {
      toast({ title: 'Insufficient credits', description: `You need ${costPerImage} credit${costPerImage === 1 ? '' : 's'} to regenerate`, variant: 'error' });
      return;
    }

    setRegeneratingIds(prev => new Set(prev).add(id));
    
    try {
      const res = await fetch('/api/generate/image-prompt/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style,
          images: [{
            id: file.id,
            fileName: file.name,
            key: file.key,
            previewUrl: file.previewUrl,
            mimeType: file.mimeType || file.type,
          }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Regeneration failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            // Parse separately so a backend 'error' event thrown below
            // propagates to the outer catch (toast) instead of being
            // swallowed here as a parse warning.
            let data: any;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              console.warn('Failed to parse SSE data:', line);
              continue;
            }

            if (data.type === 'result') {
                const result = data.result;
                setResults((prev) => prev.map(r => r.id === result.id ? result : r));
                setRegeneratingIds(prev => {
                  const next = new Set(prev);
                  next.delete(result.id);
                  return next;
                });
              } else if (data.type === 'done') {
                setRegeneratingIds(prev => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
                queryClient.invalidateQueries({ queryKey: ['credits'] });
                toast({ title: 'Prompt regenerated', variant: 'success' });
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Regeneration failed');
              }
          }
        }
      }
    } catch (error: any) {
      toast({ 
        title: 'Regeneration failed', 
        description: error.message || 'Unknown error', 
        variant: 'error' 
      });
    } finally {
      // Always clear the regenerating state — stream may end without 'done'.
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }

  const readyFiles = files.filter(
    (f) =>
      f.status === 'done' &&
      (f.previewUrl || f.dataUrl) &&
      !results.find((r) => r.id === f.id)
  );
  const totalCost = readyFiles.length * costPerImage;
  const canGenerate =
    readyFiles.length > 0 && !isGenerating && (unlimited || credits >= totalCost) && !!style;

  async function copyOne(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard access was denied.', variant: 'error' });
    }
  }

  async function copyAll() {
    const text = results
      .filter((r) => r.status === 'complete' && r.prompt)
      .map((r) => r.prompt)
      .join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard access was denied.', variant: 'error' });
    }
  }

  function doExport() {
    const rows = results
      .filter((r) => r.status === 'complete' && r.prompt)
      .map((r) => ({ fileName: r.fileName, styleLabel: r.styleLabel, prompt: r.prompt }));
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', variant: 'error' });
      return;
    }
    const content = buildPromptExport(exportFormat, rows);
    const blob = new Blob([content], {
      type: exportFormat === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = promptExportFilename(exportFormat);
    // Firefox ignores clicks on detached anchors — must be in the DOM.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const successCount = results.filter((r) => r.status === 'complete').length;

  const displayedItems = React.useMemo(() => {
    const items: Array<
      | { type: 'generating'; file: UploadedFile }
      | { type: 'result'; result: ResultRow }
    > = [];
    const handledIds = new Set<string>();

    for (const f of files) {
      const res = results.find((r) => r.id === f.id);
      if (res) {
        items.push({ type: 'result', result: res });
        handledIds.add(f.id);
      } else if (generatingIds.has(f.id)) {
        items.push({ type: 'generating', file: f });
        handledIds.add(f.id);
      }
    }

    for (const r of results) {
      if (!handledIds.has(r.id)) {
        items.push({ type: 'result', result: r });
      }
    }

    return items;
  }, [files, results, generatingIds]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
      {/* Left: Control Rail */}
      <ControlsRail
        activeTab={activeTab || 'prompt'}
        onTabChange={onTabChange || (() => {})}
        batchGeneration={true}
        setBatchGeneration={() => {}}
        user={user}
        style={style}
        onStyleChange={onStyleChange}
        styles={styles}
        costPerImage={costPerImage}
      />

      {/* Right: Workspace */}
      <div className="space-y-4">
        {/* A) Upload Card */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                  <Upload className="h-3.5 w-3.5 text-accent" />
                </div>
                <CardTitle className="text-sm">Upload Files</CardTitle>
                {files.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {readyFiles.length}/{files.length} ready
                  </Badge>
                )}
              </div>
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDropzoneExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {dropzoneExpanded ? 'Collapse' : 'Expand'}
                  {dropzoneExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {(dropzoneExpanded || files.length === 0) && (
              <ImageUploader
                files={files}
                onFilesChange={setFiles}
                batchLimit={batchLimit}
                disabled={isGenerating}
              />
            )}

            {/* Action bar / status banner */}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card-2 p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <span>{readyFiles.length} image{readyFiles.length === 1 ? '' : 's'} ready</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{totalCost} credit{totalCost === 1 ? '' : 's'} total</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {costPerImage} credit per image
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg text-xs border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => {
                      abortRef.current?.abort();
                      setFiles([]);
                      setResults([]);
                      setDropzoneExpanded(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear All
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 rounded-lg text-xs"
                    onClick={() => startStreamingGeneration()}
                    disabled={!canGenerate}
                  >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? 'Generating…' : `Generate ${readyFiles.length > 1 ? `${readyFiles.length} prompts` : 'prompt'}`}
                  </Button>
                </div>
              </div>
            )}

            {files.length > 0 && !unlimited && credits < totalCost && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                You need {totalCost} credits but have {credits}. Top up in Billing to continue.
              </p>
            )}
          </CardContent>
        </Card>

        {/* B) Generated Prompts Card */}
        {files.length > 0 && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Generated Prompts</CardTitle>
                  <CardDescription className="text-[11px]">
                    {results.length > 0
                      ? `${successCount} of ${results.length} succeeded`
                      : 'Copy any prompt straight into your generator of choice.'}
                  </CardDescription>
                </div>
                {results.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={copyAll} disabled={successCount === 0} className="h-7 text-[11px]">
                      {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedAll ? 'Copied' : 'Copy all'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {displayedItems.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8 opacity-40 mb-2" />
                  <p className="text-sm">Your prompts will appear here.</p>
                </div>
              ) : (
                <>
                  {displayedItems.map((item) => {
                    if (item.type === 'generating') {
                      const file = item.file;
                      return (
                        <div
                          key={`generating-${file.id}`}
                          className="rounded-2xl border border-border bg-card p-4 ai-card-generating transition-all duration-300"
                        >
                          <div className="flex gap-4 items-start">
                            <div className="relative w-[240px] shrink-0">
                              {file.dataUrl || file.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={file.dataUrl || file.previewUrl}
                                  alt={file.name}
                                  className="aspect-square w-full rounded-xl border border-border bg-card object-cover opacity-80"
                                />
                              ) : (
                                <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-border bg-card">
                                  <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                                </div>
                              )}
                              <p className="mt-2 truncate text-xs text-muted-foreground font-medium">
                                {file.name}
                              </p>
                            </div>

                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5">
                                  <Sparkles className="h-3.5 w-3.5 animate-spin text-accent" />
                                  <span className="text-xs font-semibold text-accent">Synthesizing Prompt</span>
                                </div>
                                <span className="text-[11px] text-muted-foreground font-medium">
                                  AI Vision Analyzing…
                                </span>
                              </div>

                              <div className="space-y-2.5 pt-2">
                                <div className="ai-skeleton-bar h-16 w-full rounded-xl" />
                                <div className="ai-skeleton-bar h-10 w-3/4 rounded-xl" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const r = item.result;
                    const srcFile = files.find((f) => f.id === r.id);
                    const preview = srcFile?.dataUrl || srcFile?.previewUrl;

                    return (
                      <PromptCard
                        key={r.id}
                        row={r}
                        previewUrl={preview}
                        onCopy={copyOne}
                        copied={copiedId === r.id}
                        onRegenerate={regenerateSingle}
                        isRegenerating={regeneratingIds.has(r.id)}
                        onRemove={(id) => {
                          setFiles((prev) => prev.filter((f) => f.id !== id));
                          setResults((prev) => prev.filter((res) => res.id !== id));
                        }}
                      />
                    );
                  })}

                  {successCount > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as PromptExportFormat)}
                        aria-label="Export format"
                        className="rounded-xl border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                      >
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                      </select>
                      <Button variant="outline" size="sm" onClick={doExport} className="h-8 text-xs">
                        {exportFormat === 'csv' ? (
                          <FileSpreadsheet className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        Export Prompts
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <ApiKeyRequiredDialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen} />
    </div>
  );
}

function PromptCard({
  row,
  previewUrl,
  onCopy,
  copied,
  onRegenerate,
  isRegenerating,
  onRemove,
}: {
  row: ResultRow;
  previewUrl?: string;
  onCopy: (id: string, text: string) => void;
  copied: boolean;
  onRegenerate: (id: string) => void;
  isRegenerating: boolean;
  onRemove: (id: string) => void;
}) {
  const { unlimited } = useCredits();
  if (row.status === 'failed') {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{row.fileName}</span>
          </span>
          {!unlimited && (
            <Badge variant="muted" className="shrink-0 text-[10px]">
              refunded
            </Badge>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {unlimited
            ? 'Generation failed for this image.'
            : 'Generation failed for this image — the credit for this image was refunded automatically.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-200 shadow-sm hover:border-accent/40">
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Thumbnail & Metadata (~240px) */}
        <div className="w-full lg:w-[240px] shrink-0 space-y-2.5">
          <div className="relative aspect-square w-full rounded-xl bg-muted/50 border border-border/80 overflow-hidden flex items-center justify-center p-2">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={row.fileName}
                className="h-full w-full object-contain rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground/50">
                <ImageIcon className="h-8 w-8 mb-1" />
                <span className="text-[10px]">No Preview</span>
              </div>
            )}

            {/* Float Delete Button */}
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors shadow-sm"
              aria-label="Remove file"
              title="Remove file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-1 px-0.5">
            <p className="truncate text-[12px] font-medium text-foreground" title={row.fileName}>
              {row.fileName}
            </p>
            <div className="pt-1 flex items-center gap-1.5">
              {row.styleLabel && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {row.styleLabel}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Content Fields (flex-1) */}
        <div className="flex-1 w-full min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Generated Prompt ({row.prompt.length} chars)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => onRegenerate(row.id)}
                disabled={isRegenerating}
                aria-label={`Regenerate prompt for ${row.fileName}`}
                className="h-7 gap-1 text-xs"
              >
                {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onCopy(row.id, row.prompt)}
                aria-label={`Copy prompt for ${row.fileName}`}
                className="h-7 gap-1 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-input bg-card-2/60 p-3.5 text-sm text-foreground leading-relaxed whitespace-pre-wrap select-all">
            {row.prompt}
          </div>

          {(row.subject || row.lighting || row.mood) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {row.subject && <Badge variant="muted" className="text-[10px]">subject: {row.subject}</Badge>}
              {row.mood && <Badge variant="muted" className="text-[10px]">mood: {row.mood}</Badge>}
              {row.lighting && <Badge variant="muted" className="text-[10px]">light: {row.lighting}</Badge>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
