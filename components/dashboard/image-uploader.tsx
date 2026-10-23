'use client';

import * as React from 'react';
import { Upload, Image as ImageIcon, X, Loader2, AlertCircle, Check, RotateCcw } from 'lucide-react';
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

// Upload pool: at most 3 files process (compress + upload) concurrently, so
// adding a large batch doesn't fire dozens of simultaneous uploads that
// saturate the browser connection and the server.
const MAX_CONCURRENT_UPLOADS = 3;
let activeUploads = 0;
const uploadWaiters: Array<() => void> = [];

async function withUploadSlot<T>(task: () => Promise<T>): Promise<T> {
  while (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    await new Promise<void>((resolve) => uploadWaiters.push(resolve));
  }
  activeUploads += 1;
  try {
    return await task();
  } finally {
    activeUploads -= 1;
    uploadWaiters.shift()?.();
  }
}

// Enable vector conversion for EPS, SVG, AI files
const DISABLE_VECTOR_CONVERSION = false;

/**
 * POST a FormData body via XMLHttpRequest so upload progress events are
 * available (fetch cannot report request-body progress). Resolves with the
 * parsed JSON body on 2xx; rejects with the server's error message when one
 * is present, otherwise `fallbackError`.
 */
function xhrUploadJson(
  url: string,
  form: FormData,
  fallbackError: string,
  onProgress?: (ratio: number) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        // Non-JSON body — keep the empty object so the fallback message wins.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.message || data.error || fallbackError));
      }
    };
    xhr.onerror = () => reject(new Error(fallbackError));
    xhr.send(form);
  });
}

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
  /** Optional content rendered directly under the dropzone, above the file list. */
  actionBar?: React.ReactNode;
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
  actionBar,
}: Props) {
  const [dragOver, setDragOver] = React.useState(false);
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Original File objects, kept by meta id so a failed upload can be
  // retried in place without asking the user to pick the file again.
  const fileStoreRef = React.useRef(new Map<string, File>());

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

      // Keep the originals for in-place retry (metas were mapped from
      // `valid` in order, so index pairing is exact).
      metas.forEach((m, i) => {
        const file = valid[i];
        if (file) fileStoreRef.current.set(m.id, file);
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
      // Runs through the upload pool — max 3 files process at a time.
      metas.forEach((m) => {
        const file = valid.find((f) => f.name === m.name && f.size === m.size);
        if (file) void withUploadSlot(() => processFile(file, m));
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
        // This converts them to web-friendly PNGs and generates preview URLs.
        // XHR so the transfer reports real progress (35 → 95).
        const form = new FormData();
        form.append('file', file);

        const data = await xhrUploadJson('/api/uploads/rasterize', form, 'rasterize_failed', (ratio) => {
          patch(meta.id, { progress: 35 + Math.round(ratio * 60) });
        });
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

        // Step 2: Upload through the server (always — avoids CORS). XHR so
        // the transfer reports real progress (30 → 95).
        const form = new FormData();
        form.append('file', uploadFile);
        form.append('reservedKey', presignData.key); // tell server to use this key
        const directData = await xhrUploadJson('/api/uploads/direct', form, 'upload_failed', (ratio) => {
          patch(meta.id, { progress: 30 + Math.round(ratio * 65) });
        });
        key = directData.key;
        mime = directData.mime;
        previewUrl = directData.previewUrl;
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
    fileStoreRef.current.delete(id);
    onFilesChange((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    fileStoreRef.current.clear();
    onFilesChange([]);
  }

  function retry(id: string) {
    const file = fileStoreRef.current.get(id);
    const meta = files.find((f) => f.id === id);
    if (!file || !meta) return;
    patch(id, { status: 'queued', progress: 0, error: undefined });
    void withUploadSlot(() => processFile(file, meta));
  }

  const label = batchLimit < 0 ? 'unlimited' : `${readyCount}/${batchLimit}`;
  const failedCount = files.filter((f) => f.status === 'error').length;
  const uploadingCount = files.filter((f) => f.status === 'queued' || f.status === 'analyzing').length;

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

      {actionBar}

      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {`${files.length} selected · ${readyCount} ready`}
            {uploadingCount > 0 ? ` · ${uploadingCount} uploading` : ''}
            {failedCount > 0 && (
              <span className="text-destructive">{` · ${failedCount} failed`}</span>
            )}
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
              {(f.status === 'queued' || f.status === 'analyzing') && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-full flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-accent transition-all duration-300"
                      style={{ width: `${f.progress ?? 0}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {f.progress ?? 0}%
                  </span>
                </div>
              )}
            </div>

            {f.status === 'error' && fileStoreRef.current.has(f.id) && (
              <button
                type="button"
                onClick={() => retry(f.id)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}

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
