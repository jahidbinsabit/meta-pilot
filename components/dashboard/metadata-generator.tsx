'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  Trash2,
  Lock,
  Download,
  Mail,
  ChevronDown,
  Settings,
  X,
  Plus,
  Send,
  Layers,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  GeneratorSettings,
  UploadedFile,
  GeneratedRow,
  ExportFormat,
  TargetPlatform,
} from '@/lib/generator/types';
import { PLATFORMS } from '@/lib/generator/types';
import { buildCsv, csvFilename, formatLabel } from '@/lib/generator/csv';
import { compressImageForUpload } from '@/lib/tools/client-image';

interface Props {
  initialSettings: GeneratorSettings;
  batchLimit: number;
  initialCredits: number;
  user: { id: string; email: string; name: string | null };
}

const STATUS_LABEL: Record<UploadedFile['status'], string> = {
  queued: 'Queued',
  analyzing: 'Analyzing',
  done: 'Ready',
  error: 'Error',
};

const STATUS_VARIANT: Record<
  UploadedFile['status'],
  'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'info' | 'muted'
> = {
  queued: 'secondary',
  analyzing: 'info',
  done: 'success',
  error: 'destructive',
};

const ACCEPT = ['.jpg', '.jpeg', '.png', '.svg', '.eps', '.ai'];

function fileExt(file: File): string {
  return ('.' + file.name.split('.').pop() || '').toLowerCase();
}

export function MetadataGenerator({ initialSettings, batchLimit, initialCredits, user }: Props) {
  const [settings, setSettings] = React.useState<GeneratorSettings>(initialSettings);
  const [selectedPlatform, setSelectedPlatform] = React.useState<TargetPlatform>('adobe');
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [includeDescription, setIncludeDescription] = React.useState(
    settings.includeDescription !== false,
  );
  const [prefixText, setPrefixText] = React.useState(settings.prefix || '');
  const [suffixText, setSuffixText] = React.useState(settings.suffix || '');
  const [negWords, setNegWords] = React.useState<string[]>(settings.negativeTitleWords);
  const [negKws, setNegKws] = React.useState<string[]>(settings.negativeKeywords);
  const [prefixEnabled, setPrefixEnabled] = React.useState(!!settings.prefix);
  const [suffixEnabled, setSuffixEnabled] = React.useState(!!settings.suffix);
  const [negWordsEnabled, setNegWordsEnabled] = React.useState(
    settings.negativeTitleWords.length > 0,
  );
  const [negKwsEnabled, setNegKwsEnabled] = React.useState(settings.negativeKeywords.length > 0);
  const [rows, setRows] = React.useState<GeneratedRow[]>([]);
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>('adobe');
  const [exportCategory, setExportCategory] = React.useState('');
  const [exportReleases, setExportReleases] = React.useState('');
  const [sendEmail, setSendEmail] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showExportPanel, setShowExportPanel] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const toast = useToast();
  const queryClient = useQueryClient();
  const { credits } = useCredits();

  // Persist last-used settings per user (localStorage + server backup).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`generator-settings:${user.id}`);
      if (raw) {
        const saved = JSON.parse(raw);
        setSettings((s) => ({ ...s, ...saved }));
        if (saved.includeDescription !== undefined) {
          setIncludeDescription(saved.includeDescription);
        }
        if (saved.prefix !== undefined) {
          setPrefixText(saved.prefix || '');
          setPrefixEnabled(!!saved.prefix);
        }
        if (saved.suffix !== undefined) {
          setSuffixText(saved.suffix || '');
          setSuffixEnabled(!!saved.suffix);
        }
        if (saved.negativeTitleWords) setNegWords(saved.negativeTitleWords);
        if (saved.negativeKeywords) setNegKws(saved.negativeKeywords);
        if (saved.platform && PLATFORMS[saved.platform as TargetPlatform]) {
          setSelectedPlatform(saved.platform as TargetPlatform);
          setExportFormat(saved.platform as TargetPlatform);
        }
      }
    } catch {
      /* ignore */
    }
  }, [user.id]);

  function persistSettings(next: Partial<GeneratorSettings> & { platform?: TargetPlatform }) {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(
          `generator-settings:${user.id}`,
          JSON.stringify({
            ...merged,
            includeDescription: next.includeDescription ?? includeDescription,
            platform: next.platform || selectedPlatform,
          }),
        );
      } catch {
        /* ignore */
      }
      return merged;
    });
  }

  function handlePlatformChange(plat: TargetPlatform) {
    setSelectedPlatform(plat);
    setExportFormat(plat);
    const config = PLATFORMS[plat];
    if (config) {
      setSettings((prev) => {
        const updated = {
          ...prev,
          titleLength: config.defaultTitleLength,
          keywordsCount: config.defaultKeywordsCount,
        };
        persistSettings({ ...updated, platform: plat });
        return updated;
      });
    }
  }

  // Store File objects in a ref to access them during upload
  const fileMapRef = React.useRef<Map<string, File>>(new Map());

  // File handling
  const addFiles = React.useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list);
      const valid = arr.filter((f) => ACCEPT.includes(fileExt(f)));
      if (valid.length < arr.length) {
        toast({
          title: 'Unsupported format',
          description: 'Only JPG, PNG, EPS, AI, SVG are accepted.',
          variant: 'error',
        });
      }
      if (valid.length === 0) return;
      setFiles((prev) => {
        const next = valid.map((f) => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          // Store the File object for later use
          fileMapRef.current.set(id, f);
          return {
            id,
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream',
            dataUrl: '',
            status: 'queued' as const,
            progress: 0,
          };
        });
        const combined = [...prev, ...next];
        if (batchLimit > 0 && combined.length > batchLimit) {
          toast({
            title: 'Batch limit reached',
            description: `Your plan allows ${batchLimit} images per batch.`,
            variant: 'error',
          });
          return prev.slice(0, batchLimit);
        }
        next.forEach((f) => void processFile(f));
        return combined;
      });
    },
    [batchLimit],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }

  async function processFile(meta: UploadedFile) {
    setFiles((prev) =>
      prev.map((f) => (f.id === meta.id ? { ...f, status: 'analyzing', progress: 10 } : f)),
    );

    try {
      // Get the original File object
      const file = fileMapRef.current.get(meta.id);
      if (!file) {
        throw new Error('file_not_found');
      }

      const ext = fileExt(file);
      const isVector = ext === '.svg' || ext === '.eps' || ext === '.ai';

      if (isVector) {
        // For vector files, use server-side rasterization
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/uploads/rasterize', { method: 'POST', body: form });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'rasterize_failed');
        }
        const { key, previewUrl, mime } = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === meta.id
              ? {
                  ...f,
                  status: 'done',
                  progress: 100,
                  key,
                  mimeType: mime,
                  previewUrl,
                  dataUrl: previewUrl,
                }
              : f,
          ),
        );
        // Clean up the file reference
        fileMapRef.current.delete(meta.id);
        return;
      }

      // For raster files (JPG, PNG), downscale to max 1024px & compress before upload
      let uploadFile = file;
      try {
        uploadFile = await compressImageForUpload(file, 1024, 0.78);
        if (uploadFile.size !== file.size) {
          setFiles((prev) => prev.map((f) => (f.id === meta.id ? { ...f, size: uploadFile.size } : f)));
        }
      } catch (compErr) {
        console.warn('Compression skipped:', compErr);
      }

      // Try presigned URL first, fallback to direct upload
      let key: string, mime: string, previewUrl: string;
      
      try {
        const presign = await fetch('/api/uploads/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: uploadFile.name, size: uploadFile.size, type: uploadFile.type }),
        });
        if (!presign.ok) {
          const j = await presign.json().catch(() => ({}));
          throw new Error(j.error || 'preview_failed');
        }
        const presignData = await presign.json();
        
        // Check if server says to use direct upload (local storage mode)
        if (presignData.useDirectUpload) {
          throw new Error('use_direct_upload');
        }
        
        setFiles((prev) => prev.map((f) => (f.id === meta.id ? { ...f, progress: 45 } : f)));

        // Upload the actual file to S3
        const put = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          body: uploadFile,
          headers: { 'Content-Type': presignData.mime },
        });
        if (!put.ok) throw new Error('upload_failed');
        
        key = presignData.key;
        mime = presignData.mime;
        previewUrl = presignData.previewUrl;
      } catch (uploadError: any) {
        // Fallback to server-proxied upload if presigned URL fails
        console.warn('Presigned upload failed, trying direct upload:', uploadError.message);
        setFiles((prev) => prev.map((f) => (f.id === meta.id ? { ...f, progress: 30 } : f)));
        
        const form = new FormData();
        form.append('file', uploadFile);
        const direct = await fetch('/api/uploads/direct', { method: 'POST', body: form });
        if (!direct.ok) {
          const j = await direct.json().catch(() => ({}));
          throw new Error(j.error || 'upload_failed');
        }
        const directData = await direct.json();
        key = directData.key;
        mime = directData.mime;
        previewUrl = directData.previewUrl;
        setFiles((prev) => prev.map((f) => (f.id === meta.id ? { ...f, progress: 75 } : f)));
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === meta.id
            ? {
                ...f,
                status: 'done',
                progress: 100,
                key,
                mimeType: mime,
                previewUrl,
                dataUrl: previewUrl,
              }
            : f,
        ),
      );

      // Clean up the file reference
      fileMapRef.current.delete(meta.id);
    } catch (e: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === meta.id
            ? { ...f, status: 'error', progress: 0, error: e?.message || 'error' }
            : f,
        ),
      );
      // Clean up the file reference even on error
      fileMapRef.current.delete(meta.id);
    }
  }

  const generate = useMutation({
    mutationFn: async () => {
      const ready = files.filter((f) => f.status === 'done' && f.previewUrl);
      if (ready.length === 0) throw new Error('no_images');
      const payload = {
        images: ready.map((f) => ({
          id: f.id,
          fileName: f.name,
          previewUrl: f.previewUrl!,
          description: f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          mimeType: f.type || 'image/jpeg',
        })),
        settings: {
          titleLength: settings.titleLength,
          descriptionLength: settings.descriptionLength,
          includeDescription,
          keywordsCount: settings.keywordsCount,
          prefix: prefixEnabled ? prefixText : '',
          suffix: suffixEnabled ? suffixText : '',
          negativeTitleWords: negWordsEnabled ? negWords : [],
          negativeKeywords: negKwsEnabled ? negKws : [],
        },
        platform: selectedPlatform,
      };
      const res = await fetch('/api/generate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'generation_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const mapped: GeneratedRow[] = (data.results || []).map((r: any) => ({
        id: r.id,
        fileName: r.fileName,
        title: r.title || '',
        description: r.description || '',
        keywords: Array.isArray(r.keywords) ? r.keywords : [],
        altText: r.altText || '',
        provider: r.provider || '',
        model: r.model || '',
        tokensUsed: r.tokensUsed || 0,
        status: r.status,
        error: r.error,
        platform: r.platform || selectedPlatform,
      }));
      setRows(mapped);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      const failed = mapped.filter((r) => r.status === 'failed').length;
      if (failed > 0) {
        toast({
          title: `${mapped.length - failed}/${mapped.length} generated`,
          description: `${failed} failed — credits refunded automatically.`,
          variant: 'warning',
        });
      } else {
        toast({ title: `All metadata generated for ${PLATFORMS[selectedPlatform].label}`, variant: 'success' });
      }
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Generation failed', description: e.message, variant: 'error' });
    },
  });

  function updateRow(id: string, field: string, value: string | string[]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRowKeyword(rowId: string, kw: string) {
    const clean = kw.trim();
    if (!clean) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (r.keywords.includes(clean)) return r;
        return { ...r, keywords: [...r.keywords, clean] };
      }),
    );
  }

  function removeRowKeyword(rowId: string, kwIdx: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, keywords: r.keywords.filter((_, i) => i !== kwIdx) };
      }),
    );
  }

  function addTag(list: 'negWords' | 'negKws', value: string) {
    const v = value.trim();
    if (!v) return;
    if (list === 'negWords') setNegWords((prev) => [...prev, v]);
    else setNegKws((prev) => [...prev, v]);
  }

  function removeTag(list: 'negWords' | 'negKws', idx: number) {
    if (list === 'negWords') setNegWords((prev) => prev.filter((_, i) => i !== idx));
    else setNegKws((prev) => prev.filter((_, i) => i !== idx));
  }

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payloadRows = rows.map((r) => ({
        fileName: r.fileName,
        title: r.title,
        description: r.description,
        keywords: r.keywords,
      }));
      const res = await fetch('/api/generate/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: payloadRows,
          format: exportFormat,
          category: exportCategory,
          releases: exportReleases,
          sendEmail,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'export_failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = csvFilename(exportFormat);
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    },
    onSuccess: () =>
      toast({ title: `Exported ${PLATFORMS[exportFormat].label} CSV`, variant: 'success' }),
    onError: (e: any) =>
      toast({ title: 'Export failed', description: e.message, variant: 'error' }),
  });

  const readyCount = files.filter((f) => f.status === 'done').length;
  const hasResults = rows.length > 0;
  const canGenerate = readyCount > 0 && !generate.isPending && credits >= readyCount;
  const batchLabel = batchLimit < 0 ? 'unlimited' : `${readyCount}/${batchLimit}`;
  const currentPlatformConfig = PLATFORMS[selectedPlatform];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Stock Photo & Vector AI Suite
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Image → Stock Metadata Generator
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate SEO-engineered titles, descriptions, and keywords optimized for individual stock
          agency algorithms.
        </p>
      </div>

      {/* Target Agency / Platform Selector */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-accent" />
                Target Stock Agency / Algorithm
              </span>
              <span className="text-xs text-muted-foreground">
                Active: <strong className="text-foreground">{currentPlatformConfig.label}</strong>
              </span>
            </div>

            {/* Platform selection pills */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {(Object.keys(PLATFORMS) as TargetPlatform[]).map((platKey) => {
                const p = PLATFORMS[platKey];
                const isActive = selectedPlatform === platKey;
                return (
                  <button
                    key={platKey}
                    type="button"
                    onClick={() => handlePlatformChange(platKey)}
                    className={cn(
                      'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
                      isActive
                        ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                        : 'border-border bg-card-2 hover:border-border hover:bg-card hover:shadow-xs',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={cn(
                          'text-xs font-bold',
                          isActive ? 'text-accent' : 'text-foreground',
                        )}
                      >
                        {p.shortLabel}
                      </span>
                      {isActive && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                    <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground leading-tight">
                      {p.tagline.split('+')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Algorithm Info Banner */}
            <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs text-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {currentPlatformConfig.label} SEO Rules Applied:
                </p>
                <p className="text-xs text-muted-foreground">{currentPlatformConfig.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {currentPlatformConfig.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: uploader + results */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Images</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {files.length} file{files.length === 1 ? '' : 's'} · {batchLabel}
                </span>
              </div>
              <CardDescription>1 credit per image</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDrop={onDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() =>
                  (document.getElementById('generator-file-input') as HTMLInputElement)?.click()
                }
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card-2 p-8 text-center transition-colors',
                  dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/60',
                )}
              >
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                <span className="mt-2 text-sm text-muted-foreground">
                  Click to upload or drag &amp; drop
                </span>
                <span className="mt-1 text-xs text-muted-foreground/80">
                  JPG, PNG, SVG, EPS, AI
                </span>
                <input
                  id="generator-file-input"
                  type="file"
                  multiple
                  accept={ACCEPT.join(',')}
                  className="hidden"
                  onChange={onPick}
                />
              </div>

              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card-2 p-2"
                    >
                      {f.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.previewUrl}
                          alt={f.name}
                          className="h-12 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                        {f.error && <p className="text-xs text-destructive">{f.error}</p>}
                      </div>
                      <Badge variant={STATUS_VARIANT[f.status]} className="shrink-0">
                        {STATUS_LABEL[f.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                className="w-full"
                onClick={() => generate.mutate()}
                disabled={!canGenerate}
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generate.isPending
                  ? `Generating for ${currentPlatformConfig.shortLabel}…`
                  : `Generate ${currentPlatformConfig.shortLabel} Metadata${readyCount > 1 ? ` (${readyCount})` : ''}`}
              </Button>
              {readyCount > 0 && credits < readyCount && (
                <p className="text-xs text-amber-400">
                  You need {readyCount} credits but have {credits}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Results table (editable before export) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Generated Metadata</CardTitle>
                  <CardDescription>
                    {hasResults
                      ? `${rows.length} image(s) processed for ${currentPlatformConfig.label}. Edit any field before exporting.`
                      : 'Generated metadata will appear here.'}
                  </CardDescription>
                </div>
                {hasResults && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          rows
                            .filter((r) => r.status === 'complete')
                            .map((r) => `${r.fileName}\t${r.title}`)
                            .join('\n'),
                        );
                        toast({ title: 'Copied titles to clipboard', variant: 'success' });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Titles
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => setShowExportPanel((v) => !v)}
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showExportPanel && hasResults && (
                <div className="space-y-3 rounded-lg border border-border bg-card-2 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Agency CSV Export Config
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {PLATFORMS[exportFormat].label} Format
                    </Badge>
                  </div>

                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Stock Agency Format
                    </label>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="adobe">Adobe Stock CSV (50 Custom Attributes + Category)</option>
                      <option value="shutterstock">Shutterstock CSV (Full Sentence Media File Format)</option>
                      <option value="freepik">Freepik CSV (Filename, Title, Keywords, Category)</option>
                      <option value="vecteezy">Vecteezy CSV (Filename, Title, Desc, Keywords, License)</option>
                      <option value="istock">iStock / Getty CSV (Clean Conceptual Format)</option>
                      <option value="generic">Universal / Standard Microstock CSV</option>
                    </select>
                  </div>

                  {(exportFormat === 'adobe' || exportFormat === 'shutterstock' || exportFormat === 'freepik' || exportFormat === 'generic') && (
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Category (Optional)
                      </label>
                      <Input
                        value={exportCategory}
                        onChange={(e) => setExportCategory(e.target.value)}
                        placeholder="e.g. Technology, Nature, Business, Graphic Resources"
                        className="mt-1"
                      />
                    </div>
                  )}

                  {(exportFormat === 'adobe' || exportFormat === 'shutterstock') && (
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Model / Property Releases (Optional)
                      </label>
                      <Input
                        value={exportReleases}
                        onChange={(e) => setExportReleases(e.target.value)}
                        placeholder="e.g. Yes, No, or Release Document Name"
                        className="mt-1"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <Toggle
                      label="Email CSV copy to me"
                      checked={sendEmail}
                      onCheckedChange={setSendEmail}
                    />
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                  >
                    {exportMutation.isPending ? (
                      <Upload className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download {PLATFORMS[exportFormat].shortLabel} CSV
                  </Button>
                </div>
              )}

              {!hasResults ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-8 w-8 text-muted-foreground/50" />
                  <span>No metadata generated yet. Upload images above to get started.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {rows.map((r) => {
                    const rowPlatform = (r.platform || selectedPlatform) as TargetPlatform;
                    const rowPlatConfig = PLATFORMS[rowPlatform] || PLATFORMS.adobe;
                    const isAdobe = rowPlatform === 'adobe';

                    return (
                      <div key={r.id} className="space-y-3 rounded-xl border border-border bg-card-2 p-4 shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 font-mono text-sm font-semibold text-foreground">
                              {r.fileName}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {rowPlatConfig.shortLabel}
                            </Badge>
                          </div>
                          <Badge
                            variant={r.status === 'complete' ? 'success' : 'destructive'}
                            className="shrink-0"
                          >
                            {r.status === 'complete' ? 'complete' : 'failed'}
                          </Badge>
                        </div>

                        {r.status === 'failed' ? (
                          <p className="text-xs text-muted-foreground">
                            {r.error || 'Generation failed'} — credit refunded automatically.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                  Title ({r.title.length} chars)
                                </label>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(r.title);
                                    setCopiedId(`title-${r.id}`);
                                    setTimeout(() => setCopiedId(null), 1500);
                                  }}
                                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                >
                                  {copiedId === `title-${r.id}` ? (
                                    <Check className="h-3 w-3 text-success" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Copy
                                </button>
                              </div>
                              <Input
                                value={r.title}
                                onChange={(e) => updateRow(r.id, 'title', e.target.value)}
                                className="mt-1"
                              />
                            </div>

                            {(includeDescription || r.description) && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Description ({r.description.length} chars)
                                  </label>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(r.description);
                                      setCopiedId(`desc-${r.id}`);
                                      setTimeout(() => setCopiedId(null), 1500);
                                    }}
                                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                  >
                                    {copiedId === `desc-${r.id}` ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    Copy
                                  </button>
                                </div>
                                <Input
                                  value={r.description}
                                  onChange={(e) => updateRow(r.id, 'description', e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                  Keywords ({r.keywords.length})
                                  {isAdobe && (
                                    <span className="ml-1 text-[10px] text-accent font-normal">
                                      (Top 10 highlighted for Adobe ranking)
                                    </span>
                                  )}
                                </label>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(r.keywords.join(', '));
                                    setCopiedId(`kw-${r.id}`);
                                    setTimeout(() => setCopiedId(null), 1500);
                                  }}
                                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                >
                                  {copiedId === `kw-${r.id}` ? (
                                    <Check className="h-3 w-3 text-success" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                  Copy All
                                </button>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {r.keywords.map((k, i) => {
                                  const isTopAdobe = isAdobe && i < 10;
                                  return (
                                    <span
                                      key={`${k}-${i}`}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                                        isTopAdobe
                                          ? 'border border-accent/40 bg-accent/15 text-accent font-semibold'
                                          : 'border border-border bg-card text-foreground',
                                      )}
                                    >
                                      {isTopAdobe && (
                                        <span className="font-mono text-[9px] opacity-75">
                                          #{i + 1}
                                        </span>
                                      )}
                                      {k}
                                      <button
                                        type="button"
                                        onClick={() => removeRowKeyword(r.id, i)}
                                        className="text-muted-foreground hover:text-destructive"
                                        aria-label={`Remove keyword ${k}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>

                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const input = e.currentTarget.elements.namedItem('newKw') as HTMLInputElement;
                                  if (input && input.value.trim()) {
                                    addRowKeyword(r.id, input.value.trim());
                                    input.value = '';
                                  }
                                }}
                                className="mt-2 flex gap-2"
                              >
                                <Input
                                  name="newKw"
                                  placeholder="Add keyword…"
                                  className="h-7 text-xs"
                                />
                                <Button type="submit" size="sm" variant="subtle" className="h-7 shrink-0">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: controls rail */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Controls Card - Title Length only */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Controls</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {currentPlatformConfig.shortLabel} Specs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Title Length
                  </label>
                  <span className="font-mono text-xs text-foreground">
                    {settings.titleLength} chars (~{Math.round(settings.titleLength / 6)} words)
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>Min: {currentPlatformConfig.limits.titleMin}</span>
                  <span className="text-accent font-medium">
                    Rec: ~{currentPlatformConfig.limits.recommendedTitleLength}
                  </span>
                  <span>Max: {currentPlatformConfig.limits.titleMax}</span>
                </div>
                <Slider
                  value={[settings.titleLength]}
                  min={currentPlatformConfig.limits.titleMin}
                  max={currentPlatformConfig.limits.titleMax}
                  step={1}
                  onValueChange={(v) => {
                    const titleLength = v[0];
                    setSettings((s) => ({ ...s, titleLength }));
                    persistSettings({ titleLength });
                  }}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Advanced Settings - Collapsible */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card-2 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-card hover:border-accent/40"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-accent" />
                Advanced
              </span>
              <ChevronDown
                className={cn('h-4 w-4 text-muted-foreground transition-transform',
                  showAdvanced && 'rotate-180')}
              />
            </button>

            {showAdvanced && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                {/* Description Length */}
                <Card>
                  <CardContent className="p-4 space-y-5">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          Description Length
                        </label>
                        {!includeDescription && (
                          <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-1 rounded-lg border px-3 py-2 font-mono text-xs transition-colors',
                          includeDescription
                            ? 'border-border bg-card-2 text-muted-foreground'
                            : 'border-border/50 bg-card-2/50 text-muted-foreground/50 line-through',
                        )}
                      >
                        {settings.descriptionLength} chars (~{Math.round(settings.descriptionLength / 6)}{' '}
                        words)
                      </p>
                    </div>

                    {/* Keywords Count */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Keywords Count
                        </label>
                        <span className="font-mono text-xs text-foreground">
                          {settings.keywordsCount} tags
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span>Min: {currentPlatformConfig.limits.keywordsMin}</span>
                        <span className="text-accent font-medium">
                          Rec: {currentPlatformConfig.limits.recommendedKeywordsCount}
                        </span>
                        <span>Max: {currentPlatformConfig.limits.keywordsMax}</span>
                      </div>
                      <Slider
                        value={[settings.keywordsCount]}
                        min={currentPlatformConfig.limits.keywordsMin}
                        max={currentPlatformConfig.limits.keywordsMax}
                        step={1}
                        onValueChange={(v) => {
                          const keywordsCount = v[0];
                          setSettings((s) => ({ ...s, keywordsCount }));
                          persistSettings({ keywordsCount });
                        }}
                        className="mt-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Options */}
                <Card>
                  <CardHeader>
                    <CardTitle>Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Toggle
                        label="Description"
                        checked={includeDescription}
                        onCheckedChange={(v) => {
                          setIncludeDescription(v);
                          persistSettings({ includeDescription: v });
                        }}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {includeDescription
                          ? 'AI will generate a stock description/caption for each image.'
                          : 'Disabled. Only title and keywords will be generated.'}
                      </p>
                    </div>

                    <div>
                      <Toggle
                        label="Prefix"
                        checked={prefixEnabled}
                        onCheckedChange={(v) => {
                          setPrefixEnabled(v);
                          persistSettings({ prefix: v ? prefixText : ''  });
                        }}
                      />
                      {prefixEnabled && (
                        <Input
                          value={prefixText}
                          onChange={(e) => {
                            setPrefixText(e.target.value);
                            persistSettings({ prefix: e.target.value });
                          }}
                          placeholder="Prepended to every title"
                          className="mt-2"
                        />
                      )}
                    </div>

                    <div>
                      <Toggle
                        label="Suffix"
                        checked={suffixEnabled}
                        onCheckedChange={(v) => {
                          setSuffixEnabled(v);
                          persistSettings({ suffix: v ? suffixText : ''  });
                        }}
                      />
                      {suffixEnabled && (
                        <Input
                          value={suffixText}
                          onChange={(e) => {
                            setSuffixText(e.target.value);
                            persistSettings({ suffix: e.target.value });
                          }}
                          placeholder="Appended to every title"
                          className="mt-2"
                        />
                      )}
                    </div>

                    <div>
                      <Toggle
                        label="Negative Title Words"
                        checked={negWordsEnabled}
                        onCheckedChange={setNegWordsEnabled}
                      />
                      {negWordsEnabled && (
                        <TagInput
                          values={negWords}
                          onAdd={(v) => addTag('negWords', v)}
                          onRemove={(i) => removeTag('negWords', i)}
                          placeholder="Word to avoid in titles"
                        />
                      )}
                    </div>

                    <div>
                      <Toggle
                        label="Negative Keywords"
                        checked={negKwsEnabled}
                        onCheckedChange={setNegKwsEnabled}
                      />
                      {negKwsEnabled && (
                        <TagInput
                          values={negKws}
                          onAdd={(v) => addTag('negKws', v)}
                          onRemove={(i) => removeTag('negKws', i)}
                          placeholder="Keyword to avoid"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TagInput({
  values,
  onAdd,
  onRemove,
  placeholder,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = React.useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft('');
  }

  return (
    <div className="mt-2 space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${v}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" variant="subtle" className="h-8 shrink-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
