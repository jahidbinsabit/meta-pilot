'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';

/**
 * Shared shell for image-based tools (bg-remover, palette, ascii, halftone,
 * dither, ai-eps-to-jpg, image-to-psd).
 *
 * Handles the uploader, the credit-cost gate, the "process" button, and
 * per-file status chips. Each tool composes its own controls inside the
 * left card and its own results inside the right card.
 */
export function ImageToolShell({
  tool,
  batchLimit = 10,
  children,
}: {
  tool: ToolEntry;
  batchLimit?: number;
  children: React.ReactNode;
}) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const toast = useToast();
  const { credits } = useCredits();
  const queryClient = useQueryClient();

  const readyFiles = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl));
  const totalCost = readyFiles.length * tool.creditCost;
  const canProcess =
    readyFiles.length > 0 &&
    !files.some((f) => f.status === 'analyzing') &&
    (tool.isFree || credits >= totalCost);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            {tool.isFree
              ? 'Free — no credit cost'
              : `${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'} per image${
                  readyFiles.length > 1 ? ` — ${totalCost} total` : ''
                }`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ImageUploader files={files} onFilesChange={setFiles} batchLimit={batchLimit} />
          {children}
          {!tool.isFree && credits < totalCost && readyFiles.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              You need {totalCost} credits but have {credits}. Top up in Billing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function useImageToolMutation() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('not overridden');
    },
  });
}

export function EmptyImageResults() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
      <p className="text-sm">Processed images will appear here.</p>
    </div>
  );
}

export function ImageResultsGrid({
  rows,
}: {
  rows: { id: string; label: string; dataUrl: string }[];
}) {
  if (rows.length === 0) return <EmptyImageResults />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <div key={r.id} className="overflow-hidden rounded-lg border border-border bg-card-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.dataUrl} alt={r.label} className="aspect-square w-full object-cover" />
          <div className="flex items-center justify-between gap-2 p-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{r.label}</span>
            <a
              href={r.dataUrl}
              download={r.label}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Download ${r.label}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FileList({ files, onClear }: { files: UploadedFile[]; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        {files.length} file{files.length === 1 ? '' : 's'} selected
      </span>
      {files.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
