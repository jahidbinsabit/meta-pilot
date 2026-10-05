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
import { MetadataSuccessModal } from '@/components/dashboard/metadata-success-modal';

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
  const [successModalOpen, setSuccessModalOpen] = React.useState(false);
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
          const ext = ('.' + (f.name.split('.').pop() || '')).toLowerCase();
          const isRaster = ext === '.jpg' || ext === '.jpeg' || ext === '.png';
          let initialDataUrl = '';
          if (isRaster && typeof window !== 'undefined') {
            try {
              initialDataUrl = URL.createObjectURL(f);
            } catch {
              // ignore
            }
          }
          return {
            id,
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream',
            dataUrl: initialDataUrl,
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
        const { key, previewUrl, dataUrl, mime } = await res.json();
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
                  dataUrl: dataUrl || previewUrl,
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

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatingIds, setGeneratingIds] = React.useState<Set<string>>(new Set());

  async function startStreamingGeneration() {
    const ready = files.filter((f) => f.status === 'done' && f.previewUrl);
    if (ready.length === 0) {
      toast({ title: 'No images ready', description: 'Upload images first', variant: 'error' });
      return;
    }

    setIsGenerating(true);
    setGeneratingIds(new Set(ready.map((f) => f.id)));
    setRows((prev) => prev.filter((r) => !ready.some((f) => f.id === r.id)));
    
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

    try {
      const res = await fetch('/api/generate/batch/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
                console.log(`Starting generation for ${data.total} images`);
              } else if (data.type === 'processing') {
                // Image is now being processed - no UI change needed since shimmer is already showing
              } else if (data.type === 'result') {
                const result = data.result;
                const mapped: GeneratedRow = {
                  id: result.id,
                  fileName: result.fileName,
                  title: result.title || '',
                  description: result.description || '',
                  keywords: Array.isArray(result.keywords) ? result.keywords : [],
                  altText: result.altText || '',
                  provider: result.provider || '',
                  model: result.model || '',
                  tokensUsed: result.tokensUsed || 0,
                  status: result.status || 'complete',
                  error: result.error,
                  platform: result.platform || selectedPlatform,
                };
                
                // Add/update this result and remove from generating
                setRows(prev => {
                  const existing = prev.find(r => r.id === result.id);
                  if (existing) {
                    return prev.map(r => r.id === result.id ? mapped : r);
                  }
                  return [...prev, mapped];
                });
                
                setGeneratingIds(prev => {
                  const next = new Set(prev);
                  next.delete(result.id);
                  return next;
                });

              } else if (data.type === 'done') {
                setIsGenerating(false);
                setGeneratingIds(new Set());
                queryClient.invalidateQueries({ queryKey: ['credits'] });
                setSuccessModalOpen(true);
                
                if (data.failed > 0) {
                  toast({
                    title: `${data.succeeded}/${data.succeeded + data.failed} generated`,
                    description: `${data.failed} failed — credits refunded automatically.`,
                    variant: 'warning',
                  });
                } else {
                  toast({ 
                    title: `Generated ${data.succeeded} metadata entries`, 
                    variant: 'success' 
                  });
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
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ 
        title: 'Generation failed', 
        description: error.message || 'Unknown error', 
        variant: 'error' 
      });
    }
  }

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

  async function regenerateSingle(rowId: string) {
    const f = files.find((file) => file.id === rowId);
    if (!f || !f.previewUrl) return;
    if (credits < 1) {
      toast({ title: 'Insufficient credits', description: 'You need at least 1 credit to regenerate.', variant: 'error' });
      return;
    }

    setGeneratingIds((prev) => new Set(prev).add(rowId));

    const payload = {
      images: [
        {
          id: f.id,
          fileName: f.name,
          previewUrl: f.previewUrl,
          description: f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          mimeType: f.type || 'image/jpeg',
        },
      ],
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

    try {
      const res = await fetch('/api/generate/batch/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Regeneration failed');
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
                const mapped: GeneratedRow = {
                  id: result.id,
                  fileName: result.fileName,
                  title: result.title || '',
                  description: result.description || '',
                  keywords: Array.isArray(result.keywords) ? result.keywords : [],
                  altText: result.altText || '',
                  provider: result.provider || '',
                  model: result.model || '',
                  tokensUsed: result.tokensUsed || 0,
                  status: result.status || 'complete',
                  error: result.error,
                  platform: result.platform || selectedPlatform,
                };

                setRows((prev) => prev.map((r) => (r.id === result.id ? mapped : r)));
                setGeneratingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(result.id);
                  return next;
                });
              } else if (data.type === 'done') {
                queryClient.invalidateQueries({ queryKey: ['credits'] });
                toast({ title: 'Regenerated successfully', variant: 'success' });
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      toast({ title: 'Regeneration failed', description: e.message, variant: 'error' });
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
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
  const canGenerate = readyCount > 0 && !isGenerating && credits >= readyCount;
  const batchLabel = batchLimit < 0 ? 'unlimited' : `${readyCount}/${batchLimit}`;
  const currentPlatformConfig = PLATFORMS[selectedPlatform];

  // Presentational lookup: result rows echo back the uploaded file id, so we
  // can show the source thumbnail + original file size without any API change.
  const fileById = React.useMemo(
    () => new Map(files.map((f) => [f.id, f] as const)),
    [files],
  );

  const displayedItems = React.useMemo(() => {
    const items: Array<
      | { type: 'generating'; file: UploadedFile }
      | { type: 'row'; row: GeneratedRow; file?: UploadedFile }
    > = [];
    const handledIds = new Set<string>();

    for (const f of files) {
      const row = rows.find((r) => r.id === f.id);
      if (row) {
        items.push({ type: 'row', row, file: f });
        handledIds.add(f.id);
      } else if (generatingIds.has(f.id)) {
        items.push({ type: 'generating', file: f });
        handledIds.add(f.id);
      }
    }

    for (const r of rows) {
      if (!handledIds.has(r.id)) {
        items.push({ type: 'row', row: r, file: fileById.get(r.id) });
      }
    }

    return items;
  }, [files, rows, generatingIds, fileById]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Stock Photo & Vector AI Suite
        </p>
        <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight">
          Image → Stock Metadata Generator
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Generate SEO-engineered titles, descriptions, and keywords optimized for individual stock
          agency algorithms.
        </p>
      </div>

      {/* Target Agency / Platform Selector */}
      <Card className="border-border bg-card">
        <CardContent className="p-3">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-accent" />
                Target Stock Agency / Algorithm
              </span>
              <span className="text-[11px] text-muted-foreground">
                Active: <strong className="text-foreground">{currentPlatformConfig.label}</strong>
              </span>
            </div>

            {/* Platform selection pills */}
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(PLATFORMS) as TargetPlatform[]).map((platKey) => {
                const p = PLATFORMS[platKey];
                const isActive = selectedPlatform === platKey;
                return (
                  <button
                    key={platKey}
                    type="button"
                    onClick={() => handlePlatformChange(platKey)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                      isActive
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-card-2 text-muted-foreground hover:border-accent/40 hover:text-foreground',
                    )}
                  >
                    <span className="flex-1 truncate text-xs font-semibold">{p.shortLabel}</span>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>

            {/* Algorithm Info Banner */}
            <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {currentPlatformConfig.label} SEO Rules Applied:
                </p>
                <p className="text-[11px] text-muted-foreground">{currentPlatformConfig.description}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {currentPlatformConfig.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Left: uploader + results */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Images</CardTitle>
                <span className="text-[11px] text-muted-foreground">
                  {files.length} file{files.length === 1 ? '' : 's'} · {batchLabel}
                </span>
              </div>
              <CardDescription className="text-[11px]">1 credit per image</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
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
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card-2 p-6 text-center transition-colors',
                  dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/60',
                )}
              >
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
                <span className="mt-1.5 text-[13px] font-medium text-foreground">
                  Click to upload or drag &amp; drop
                </span>
                <span className="mt-0.5 text-[11px] text-muted-foreground/80">
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
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {files.length} file{files.length === 1 ? '' : 's'} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFiles([]);
                        setRows([]);
                        fileMapRef.current.clear();
                      }}
                      className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
                    >
                      <X className="h-3 w-3" />
                      Clear all
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-card-2 p-1.5"
                    >
                      {f.dataUrl || f.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.dataUrl || f.previewUrl}
                          alt={f.name}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                          {f.status === 'analyzing' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">{f.name}</p>
                        {f.error && <p className="text-[11px] text-destructive">{f.error}</p>}
                      </div>
                      <Badge variant={STATUS_VARIANT[f.status]} className="shrink-0 text-[10px]">
                        {STATUS_LABEL[f.status]}
                      </Badge>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => {
                          setFiles((prev) => prev.filter((x) => x.id !== f.id));
                          fileMapRef.current.delete(f.id);
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                    ))}
                  </ul>
                </>
              )}

              <Button
                size="sm"
                className="h-9 w-full text-[13px]"
                onClick={() => startStreamingGeneration()}
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating
                  ? `Generating for ${currentPlatformConfig.shortLabel}…`
                  : `Generate ${currentPlatformConfig.shortLabel} Metadata${readyCount > 1 ? ` (${readyCount})` : ''}`}
              </Button>
              {readyCount > 0 && credits < readyCount && (
                <p className="text-[11px] text-amber-400">
                  You need {readyCount} credits but have {credits}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Results table (editable before export) */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm">Generated Metadata</CardTitle>
                  <CardDescription className="text-[11px]">
                    {hasResults
                      ? `${rows.length} image(s) processed for ${currentPlatformConfig.label}. Edit any field before exporting.`
                      : 'Generated metadata will appear here.'}
                  </CardDescription>
                </div>
                {hasResults && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setFiles([]);
                        setRows([]);
                        fileMapRef.current.clear();
                        setShowExportPanel(false);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
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
                      <Copy className="h-3 w-3" />
                      Copy Titles
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setShowExportPanel((v) => !v)}
                    >
                      <Download className="h-3 w-3" />
                      Export CSV
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {showExportPanel && hasResults && (
                <div className="space-y-2.5 rounded-lg border border-border bg-card-2 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-foreground">
                      Agency CSV Export Config
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {PLATFORMS[exportFormat].label} Format
                    </Badge>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
                      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
                      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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

              {displayedItems.length === 0 ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-8 w-8 text-muted-foreground/50" />
                  <span>No metadata generated yet. Upload images above to get started.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedItems.map((item) => {
                    if (item.type === 'generating') {
                      const file = item.file;
                      return (
                        <div
                          key={`generating-${file.id}`}
                          className="ai-card-generating transition-all duration-300"
                        >
                          <div className="flex gap-3.5 p-3.5">
                            {/* Source thumbnail with soft AI badge */}
                            <div className="relative w-[132px] shrink-0">
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
                              <p className="mt-1.5 truncate text-[10px] text-muted-foreground font-medium">
                                {file.name}
                              </p>
                            </div>
                            
                            {/* Shimmer content */}
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {currentPlatformConfig.shortLabel}
                                  </Badge>
                                  <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5">
                                    <Sparkles className="h-3 w-3 animate-spin text-accent" />
                                    <span className="text-[10px] font-medium text-accent">
                                      AI generating metadata…
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Sleek AI Shimmer Skeleton Lines */}
                              <div className="space-y-2">
                                {/* Title placeholder */}
                                <div className="ai-skeleton-bar h-5 w-4/5"></div>
                                {/* Description placeholder */}
                                <div className="ai-skeleton-bar h-4 w-full"></div>
                                {/* Keyword pill placeholders */}
                                <div className="flex gap-1.5 flex-wrap pt-1">
                                  <div className="ai-skeleton-bar h-5 w-16"></div>
                                  <div className="ai-skeleton-bar h-5 w-20"></div>
                                  <div className="ai-skeleton-bar h-5 w-14"></div>
                                  <div className="ai-skeleton-bar h-5 w-24"></div>
                                  <div className="ai-skeleton-bar h-5 w-16"></div>
                                  <div className="ai-skeleton-bar h-5 w-12"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const r = item.row;
                    const rowPlatform = (r.platform || selectedPlatform) as TargetPlatform;
                    const rowPlatConfig = PLATFORMS[rowPlatform] || PLATFORMS.adobe;
                    const isAdobe = rowPlatform === 'adobe';
                    const srcFile = item.file || fileById.get(r.id);
                    const preview = srcFile?.dataUrl || srcFile?.previewUrl;
                    const isRowGenerating = generatingIds.has(r.id);

                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "overflow-hidden rounded-lg border border-border bg-card-2 transition-all duration-300",
                          isRowGenerating && "opacity-60 pointer-events-none"
                        )}
                      >
                        <div className="flex gap-3 p-3">
                          {/* Source thumbnail */}
                          <div className="w-[132px] shrink-0">
                            {preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={preview}
                                alt={r.fileName}
                                className="aspect-square w-full rounded-md border border-border bg-card object-cover"
                              />
                            ) : (
                              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-card">
                                <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                            <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
                              {r.fileName}
                            </p>
                            {srcFile && (
                              <p className="text-[10px] text-muted-foreground/70">
                                Size: {formatSize(srcFile.size)}
                              </p>
                            )}
                          </div>

                          {/* Editable metadata */}
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                  {rowPlatConfig.shortLabel}
                                </Badge>
                                {isAdobe && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Top 10 keywords rank highest
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant={r.status === 'complete' ? 'success' : 'destructive'}
                                className="shrink-0 text-[10px]"
                              >
                                {r.status === 'complete' ? 'complete' : 'failed'}
                              </Badge>
                            </div>

                            {r.status === 'failed' ? (
                              <p className="text-xs text-muted-foreground">
                                {r.error || 'Generation failed'} — credit refunded automatically.
                              </p>
                            ) : (
                              <>
                                <div>
                                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Title ({r.title.length} chars)
                                  </label>
                                  <Input
                                    value={r.title}
                                    onChange={(e) => updateRow(r.id, 'title', e.target.value)}
                                    className="mt-1 h-9 text-[13px]"
                                  />
                                </div>

                                {(includeDescription || r.description) && (
                                  <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                      Description ({r.description.length} chars)
                                    </label>
                                    <Input
                                      value={r.description}
                                      onChange={(e) =>
                                        updateRow(r.id, 'description', e.target.value)
                                      }
                                      className="mt-1 h-9 text-[13px]"
                                    />
                                  </div>
                                )}

                                <div>
                                  <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Keywords ({r.keywords.length})
                                  </label>
                                  <div className="mt-1 rounded-md border border-border bg-card p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {r.keywords.map((k, i) => {
                                        const isTopAdobe = isAdobe && i < 10;
                                        return (
                                          <span
                                            key={`${k}-${i}`}
                                            className={cn(
                                              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                                              isTopAdobe
                                                ? 'border-accent/40 bg-accent/15 text-accent'
                                                : 'border-border bg-card-2 text-foreground',
                                            )}
                                          >
                                            {isTopAdobe && (
                                              <span className="font-mono text-[9px] opacity-70">
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
                                        const input = e.currentTarget.elements.namedItem(
                                          'newKw',
                                        ) as HTMLInputElement;
                                        if (input && input.value.trim()) {
                                          addRowKeyword(r.id, input.value.trim());
                                          input.value = '';
                                        }
                                      }}
                                      className="mt-1.5"
                                    >
                                      <input
                                        name="newKw"
                                        placeholder="Add keyword…"
                                        className="h-7 w-full rounded border border-border bg-background/60 px-2 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      />
                                    </form>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Footer actions */}
                        {r.status === 'complete' && (
                          <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px]"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(r.title);
                                  setCopiedId(`title-${r.id}`);
                                  setTimeout(() => setCopiedId(null), 1500);
                                }}
                              >
                                {copiedId === `title-${r.id}` ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                Copy Title
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px]"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(r.keywords.join(', '));
                                  setCopiedId(`kw-${r.id}`);
                                  setTimeout(() => setCopiedId(null), 1500);
                                }}
                              >
                                {copiedId === `kw-${r.id}` ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                Copy Keywords
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => regenerateSingle(r.id)}
                              disabled={isGenerating || isRowGenerating}
                            >
                              {isRowGenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              Regenerate
                            </Button>
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
        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          {/* Controls Card - Title Length only */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Controls</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {currentPlatformConfig.shortLabel} Specs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Title Length
                  </label>
                  <span className="font-mono text-[11px] text-foreground">
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
                  className="mt-1.5"
                />
              </div>

              {/* Keywords Count */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Keywords Count
                  </label>
                  <span className="font-mono text-[11px] text-foreground">
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
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Advanced Settings - Collapsible */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card-2 px-3 py-2 text-[13px] font-medium transition-colors hover:bg-card hover:border-accent/40"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-accent" />
                Advanced
              </span>
              <ChevronDown
                className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform',
                  showAdvanced && 'rotate-180')}
              />
            </button>

            {showAdvanced && (
              <div className="space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                {/* Description Length */}
                <Card>
                  <CardContent className="p-3 space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
                          'mt-1 rounded-lg border px-3 py-1.5 font-mono text-[11px] transition-colors',
                          includeDescription
                            ? 'border-border bg-card-2 text-muted-foreground'
                            : 'border-border/50 bg-card-2/50 text-muted-foreground/50 line-through',
                        )}
                      >
                        {settings.descriptionLength} chars (~{Math.round(settings.descriptionLength / 6)}{' '}
                        words)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Options */}
                <Card>
                  <CardHeader className="p-4 pb-0">
                    <CardTitle className="text-sm">Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
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

      {/* Success Modal */}
      <MetadataSuccessModal
        open={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        rows={rows}
        platform={selectedPlatform}
        exportFormat={exportFormat}
        isExporting={exportMutation.isPending}
        onExport={() => {
          exportMutation.mutate();
          setSuccessModalOpen(false);
        }}
      />
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
