'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export function ImageToPrompt({ batchLimit, costPerImage, userId }: Props) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [style, setStyle] = React.useState('');
  const [results, setResults] = React.useState<ResultRow[]>([]);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<PromptExportFormat>('csv');
  const toast = useToast();
  const { credits } = useCredits();
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
  const [generatingIds, setGeneratingIds] = React.useState<Set<string>>(new Set());
  const [regeneratingIds, setRegeneratingIds] = React.useState<Set<string>>(new Set());

  async function startStreamingGeneration() {
    const ready = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl));
    if (ready.length === 0) {
      toast({ title: 'No images ready', description: 'Upload images first', variant: 'error' });
      return;
    }
    if (!style) {
      toast({ title: 'No style selected', description: 'Select a prompt style first', variant: 'error' });
      return;
    }

    setIsGenerating(true);
    setGeneratingIds(new Set(ready.map((f) => f.id)));
    setResults((prev) => prev.filter((r) => !ready.some((f) => f.id === r.id)));

    try {
      const res = await fetch('/api/generate/image-prompt/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style,
          images: ready.map((f) => ({
            id: f.id,
            fileName: f.name,
            key: f.key,
            previewUrl: f.previewUrl,
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
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'init') {
                console.log(`Starting prompt generation for ${data.total} images`);
              } else if (data.type === 'processing') {
                // Image is being processed - shimmer already showing
              } else if (data.type === 'result') {
                const result = data.result;
                
                // Add or update this result and remove from generating
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
                  toast({
                    title: `${data.succeeded}/${data.succeeded + data.failed} prompts generated`,
                    description: `${data.failed} failed — ${data.refunded} credit${data.refunded === 1 ? '' : 's'} refunded automatically.`,
                    variant: 'warning',
                  });
                } else {
                  toast({ title: 'Prompts generated', variant: 'success' });
                }
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Generation failed');
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
    } catch (error: any) {
      setIsGenerating(false);
      setGeneratingIds(new Set());
      toast({ 
        title: 'Generation failed', 
        description: error.message || 'Unknown error', 
        variant: 'error' 
      });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }

  async function regenerateSingle(id: string) {
    const file = files.find(f => f.id === id);
    if (!file || !file.previewUrl) {
      toast({ title: 'File not found', description: 'Cannot regenerate this prompt', variant: 'error' });
      return;
    }
    
    if (credits < costPerImage) {
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
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'result') {
                const result = data.result;
                
                // Update the existing result
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
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
    } catch (error: any) {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ 
        title: 'Regeneration failed', 
        description: error.message || 'Unknown error', 
        variant: 'error' 
      });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }

  const readyFiles = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl));
  const totalCost = readyFiles.length * costPerImage;
  const canGenerate =
    readyFiles.length > 0 && !isGenerating && credits >= totalCost && !!style;

  async function copyOne(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function copyAll() {
    const text = results
      .filter((r) => r.status === 'complete' && r.prompt)
      .map((r) => r.prompt)
      .join('\n\n');
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
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
    a.click();
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
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Image → Prompt
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Reconstruct an image as a prompt
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload images and get a detailed, paste-ready prompt capturing subject, style, lighting,
          composition, and mood.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: uploader + the single control */}
        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
            <CardDescription>
              {costPerImage} credit{readyFiles.length > 0 ? 's' : ''} per image
              {readyFiles.length > 1 ? ` — ${totalCost} total` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUploader
              files={files}
              onFilesChange={setFiles}
              batchLimit={batchLimit}
              disabled={isGenerating}
            />

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prompt Style
              </label>
              <select
                value={style}
                onChange={(e) => onStyleChange(e.target.value)}
                disabled={!styles?.length}
                className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm disabled:opacity-50"
              >
                {!styles?.length && <option value="">Loading presets…</option>}
                {styles?.map((s: { slug: string; label: string }) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                The admin defines which styles are available and what each one asks the model for.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {readyFiles.length > 0
                  ? `${readyFiles.length} image${readyFiles.length === 1 ? '' : 's'} · ${totalCost} credit${totalCost === 1 ? '' : 's'}`
                  : `${costPerImage} credit per image`}
              </span>
              <Button onClick={() => startStreamingGeneration()} disabled={!canGenerate}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating
                  ? 'Generating…'
                  : `Generate ${readyFiles.length > 1 ? `${readyFiles.length} prompts` : 'prompt'}`}
              </Button>
            </div>

            {readyFiles.length > 0 && credits < totalCost && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                You need {totalCost} credits but have {credits}. Top up in Billing to continue.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right: results */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Generated prompts</CardTitle>
                <CardDescription>
                  {results.length > 0
                    ? `${successCount} of ${results.length} succeeded`
                    : 'Copy any prompt straight into your generator of choice.'}
                </CardDescription>
              </div>
              {results.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResults([])}
                    className="gap-1.5 border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyAll} disabled={successCount === 0}>
                    {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedAll ? 'Copied' : 'Copy all'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayedItems.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <ImageIconEmpty />
                <p className="mt-2 text-sm">Your prompts will appear here.</p>
              </div>
            ) : (
              <>
                {displayedItems.map((item) => {
                  if (item.type === 'generating') {
                    const file = item.file;
                    return (
                      <div
                        key={`generating-${file.id}`}
                        className="ai-card-generating p-3.5 transition-all duration-300"
                      >
                        <div className="flex gap-3.5">
                          {/* Source thumbnail */}
                          <div className="relative w-20 shrink-0">
                            {file.dataUrl || file.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={file.dataUrl || file.previewUrl}
                                alt={file.name}
                                className="aspect-square w-full rounded-md border border-border bg-card object-cover opacity-80"
                              />
                            ) : (
                              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-card">
                                <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                              </div>
                            )}
                            <p className="mt-1 truncate text-[10px] text-muted-foreground font-medium">
                              {file.name}
                            </p>
                          </div>

                          {/* Shimmer content */}
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5">
                                <Sparkles className="h-3 w-3 animate-spin text-accent" />
                                <span className="text-xs font-semibold text-accent">Synthesizing Prompt</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-medium">
                                AI Vision Analyzing…
                              </span>
                            </div>

                            <div className="space-y-2 pt-1">
                              <div className="ai-skeleton-bar h-4 w-full"></div>
                              <div className="ai-skeleton-bar h-4 w-5/6"></div>
                              <div className="ai-skeleton-bar h-4 w-4/6"></div>
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
                    />
                  );
                })}

                {successCount > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as PromptExportFormat)}
                      aria-label="Export format"
                      className="rounded-lg border border-input bg-background/60 px-2 py-1.5 text-xs"
                    >
                      <option value="csv">CSV</option>
                      <option value="txt">TXT</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={doExport}>
                      {exportFormat === 'csv' ? (
                        <FileSpreadsheet className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Export
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
}: {
  row: ResultRow;
  previewUrl?: string;
  onCopy: (id: string, text: string) => void;
  copied: boolean;
  onRegenerate: (id: string) => void;
  isRegenerating: boolean;
}) {
  if (row.status === 'failed') {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{row.fileName}</span>
          </span>
          <Badge variant="muted" className="shrink-0">
            refunded
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.error || 'Generation failed'} — the credit for this image was refunded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card-2 p-3">
      <div className="flex gap-3.5">
        {/* Source image thumbnail */}
        <div className="relative w-24 shrink-0">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={row.fileName}
              className="aspect-square w-full rounded-md border border-border bg-card object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-card">
              <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
            </div>
          )}
          <p className="mt-1.5 truncate text-[10px] text-muted-foreground font-medium">
            {row.fileName}
          </p>
        </div>

        {/* Generated prompt content */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {row.styleLabel && (
                <Badge variant="secondary" className="text-[10px]">
                  {row.styleLabel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onRegenerate(row.id)}
                disabled={isRegenerating}
                aria-label={`Regenerate prompt for ${row.fileName}`}
                className="text-muted-foreground hover:text-accent"
              >
                {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onCopy(row.id, row.prompt)}
                aria-label={`Copy prompt for ${row.fileName}`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          
          <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">{row.prompt}</p>
          
          {(row.subject || row.lighting || row.mood) && (
            <div className="mt-2 flex flex-wrap gap-1.5 pt-1">
              {row.mood && <Badge variant="muted">mood: {row.mood}</Badge>}
              {row.lighting && <Badge variant="muted">light: {row.lighting}</Badge>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageIconEmpty() {
  return (
    <svg
      className="h-10 w-10 opacity-40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
