'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  const generate = useMutation({
    mutationFn: async () => {
      const ready = files.filter((f) => f.status === 'done' && f.previewUrl);
      if (ready.length === 0) throw new Error('no_images');
      if (!style) throw new Error('no_style');
      const res = await fetch('/api/generate/image-prompt', {
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
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'generation_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResults((prev) => [...prev, ...(data.results || [])]);
      // Refresh the sidebar balance immediately rather than waiting for the poll.
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      const failed = data.failed || 0;
      if (failed > 0) {
        toast({
          title: `${data.succeeded}/${data.succeeded + failed} prompts generated`,
          description: `${failed} failed — ${data.refunded} credit${data.refunded === 1 ? '' : 's'} refunded automatically.`,
          variant: 'warning',
        });
      } else {
        toast({ title: 'Prompt generated', variant: 'success' });
      }
    },
    onError: (e: any) => {
      toast({ title: 'Generation failed', description: e.message, variant: 'error' });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
  });

  const readyFiles = files.filter((f) => f.status === 'done' && f.previewUrl);
  const totalCost = readyFiles.length * costPerImage;
  const canGenerate =
    readyFiles.length > 0 && !generate.isPending && credits >= totalCost && !!style;

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
              disabled={generate.isPending}
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
              <Button onClick={() => generate.mutate()} disabled={!canGenerate}>
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generate.isPending
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
                <Button variant="outline" size="sm" onClick={copyAll} disabled={successCount === 0}>
                  {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedAll ? 'Copied' : 'Copy all'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <ImageIconEmpty />
                <p className="mt-2 text-sm">Your prompts will appear here.</p>
              </div>
            ) : (
              <>
                {results.map((r) => (
                  <PromptCard key={r.id} row={r} onCopy={copyOne} copied={copiedId === r.id} />
                ))}

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
  onCopy,
  copied,
}: {
  row: ResultRow;
  onCopy: (id: string, text: string) => void;
  copied: boolean;
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
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{row.fileName}</span>
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
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{row.prompt}</p>
      {(row.subject || row.lighting || row.mood) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.styleLabel && <Badge variant="muted">{row.styleLabel}</Badge>}
          {row.mood && <Badge variant="muted">mood: {row.mood}</Badge>}
          {row.lighting && <Badge variant="muted">light: {row.lighting}</Badge>}
        </div>
      )}
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
