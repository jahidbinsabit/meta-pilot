'use client';

import * as React from 'react';
import { Upload, Image as ImageIcon, X, Loader2, AlertCircle, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/lib/generator/types';
import { compressImageForUpload } from '@/lib/tools/client-image';

/**
 * Shared multi-file image uploader (PROMPT 4 / PROMPT 5).
 *
 * Supports the same formats as the generator: JPG, PNG, SVG, EPS, AI.
 * Raster formats are uploaded directly to S3 via a presigned URL; vector
 * formats (EPS/AI/SVG) are converted server-side through
 * /api/uploads/rasterize, which returns the same { key, previewUrl } shape.
 */

const ACCEPT = ['.jpg', '.jpeg', '.png', '.svg', '.eps', '.ai'];
const VECTOR = new Set(['.svg', '.eps', '.ai']);

// Enable vector conversion for EPS, SVG, AI files
const DISABLE_VECTOR_CONVERSION = false;

export function fileExt(name: string): string {
  return ('.' + (name.split('.').pop() || '')).toLowerCase();
}

interface Props {
  files: UploadedFile[];
  onFilesChange: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  /** -1 means unlimited. */
  batchLimit: number;
  disabled?: boolean;
  onReadyChange?: (readyCount: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUploader({
  files,
  onFilesChange,
  batchLimit,
  disabled = false,
  onReadyChange,
}: Props) {
  const [dragOver, setDragOver] = React.useState(false);
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const readyCount = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl)).length;
  React.useEffect(() => {
    onReadyChange?.(readyCount);
  }, [readyCount, onReadyChange]);

  const addFiles = React.useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list);
      const valid = arr.filter((f) => ACCEPT.includes(fileExt(f.name)));
      if (valid.length < arr.length) {
        toast({
          title: 'Unsupported format',
          description: 'Only JPG, PNG, SVG, EPS, and AI files are accepted.',
          variant: 'error',
        });
      }
      if (valid.length === 0) return;

      const metas: UploadedFile[] = valid.map((f) => {
        const ext = fileExt(f.name);
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
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
          dataUrl: initialDataUrl,
          status: 'queued',
          progress: 0,
        };
      });

      let next: UploadedFile[] = [];
      onFilesChange((prev) => {
        const combined = [...prev, ...metas];
        if (batchLimit > 0 && combined.length > batchLimit) {
          toast({
            title: 'Batch limit reached',
            description: `Your plan allows ${batchLimit} image${batchLimit === 1 ? '' : 's'} per batch.`,
            variant: 'error',
          });
          next = combined.slice(0, batchLimit);
        } else {
          next = combined;
        }
        return next;
      });

      // Upload outside the state updater so the closure sees the full set.
      metas.forEach((m) => {
        const file = valid.find((f) => f.name === m.name && f.size === m.size);
        if (file) void processFile(file, m);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchLimit],
  );

  const patch = (id: string, changes: Partial<UploadedFile>) => {
    onFilesChange((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  };

  // Force cache bust - vector upload bypass
  async function processFile(file: File, meta: UploadedFile) {
    patch(meta.id, { status: 'analyzing', progress: 15 });
    const ext = fileExt(file.name);
    try {
      if (VECTOR.has(ext) && !DISABLE_VECTOR_CONVERSION) {
        patch(meta.id, { status: 'analyzing', progress: 35 });
        
        // Use server-side rasterization for vector formats (EPS, AI, SVG)
        // This converts them to web-friendly PNGs and generates preview URLs
        const form = new FormData();
        form.append('file', file);
        
        const res = await fetch('/api/uploads/rasterize', {
          method: 'POST',
          body: form,
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || j.error || 'rasterize_failed');
        }

        const data = await res.json();
        patch(meta.id, {
          status: 'done',
          progress: 100,
          key: data.key,
          mimeType: data.mime || 'image/png',
          previewUrl: data.previewUrl,
          dataUrl: data.dataUrl || data.previewUrl,
          previewWidth: 0,
          previewHeight: 0,
        });
        return;
      }

      // Optimize & downscale raster images to max 1024px before uploading to save tokens & bandwidth
      let uploadFile = file;
      try {
        uploadFile = await compressImageForUpload(file, 1024, 0.78);
        if (uploadFile.size !== file.size) {
          patch(meta.id, { size: uploadFile.size });
        }
      } catch (compErr) {
        console.warn('Compression skipped:', compErr);
      }

      // Upload via server proxy — avoids CORS issues with S3/R2 direct PUT
      let key: string, mime: string, previewUrl: string;

      try {
        // Step 1: Get a key reservation from the server
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

        patch(meta.id, { progress: 30 });

        // Step 2: Upload through the server (always — avoids CORS)
        const form = new FormData();
        form.append('file', uploadFile);
        form.append('reservedKey', presignData.key); // tell server to use this key
        const direct = await fetch('/api/uploads/direct', { method: 'POST', body: form });
        if (!direct.ok) {
          const j = await direct.json().catch(() => ({}));
          throw new Error(j.error || 'upload_failed');
        }
        const directData = await direct.json();
        key = directData.key;
        mime = directData.mime;
        previewUrl = directData.previewUrl;

        patch(meta.id, { progress: 75 });
      } catch (uploadError: any) {
        throw uploadError;
      }

      patch(meta.id, {
        status: 'done',
        progress: 100,
        key,
        mimeType: mime,
        previewUrl,
      });
    } catch (e: any) {
      patch(meta.id, { status: 'error', progress: 0, error: e?.message || 'error' });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }

  function remove(id: string) {
    onFilesChange((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    onFilesChange([]);
  }

  const label = batchLimit < 0 ? 'unlimited' : `${readyCount}/${batchLimit}`;

  return (
    <div className="space-y-3">
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card-2 p-8 text-center transition-colors',
          dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/60',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
        <span className="mt-2 text-sm text-muted-foreground">
          Click to upload or drag &amp; drop
        </span>
        <span className="mt-1 text-xs text-muted-foreground/80">
          JPG, PNG, SVG, EPS, AI — {label}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT.join(',')}
          className="hidden"
          onChange={onPick}
        />
      </div>

      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card-2 p-2"
          >
            {f.dataUrl || f.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.dataUrl || f.previewUrl}
                alt={f.name}
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                {f.status === 'analyzing' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(f.size)}
                {f.error ? ` — ${f.error}` : ''}
              </p>
            </div>

            <StatusChip status={f.status} />

            <button
              type="button"
              onClick={() => remove(f.id)}
              aria-label={`Remove ${f.name}`}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusChip({ status }: { status: UploadedFile['status'] }) {
  if (status === 'analyzing' || status === 'queued') {
    return (
      <Badge variant="info" className="shrink-0 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === 'analyzing' ? 'Analyzing' : 'Queued'}
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="shrink-0 gap-1">
        <AlertCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="shrink-0 gap-1">
      <Check className="h-3 w-3" />
      Ready
    </Badge>
  );
}
