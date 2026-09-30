'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, Download } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { loadPixels, pixelsToCanvas, canvasToBlob, downloadBlob } from '@/lib/tools/client-image';
import { applyDither } from '@/lib/tools/dither';

export function DitherClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [mode, setMode] = React.useState<'floyd-steinberg' | 'ordered' | 'none'>('floyd-steinberg');
  const [levels, setLevels] = React.useState(8);
  const [matrixSize, setMatrixSize] = React.useState<4 | 8>(4);
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const toast = useToast();
  const { credits } = useCredits();
  const queryClient = useQueryClient();

  const readyFiles = files.filter((f) => f.status === 'done' && f.previewUrl);
  const totalCost = readyFiles.length * tool.creditCost;
  const canProcess =
    readyFiles.length > 0 &&
    !files.some((f) => f.status === 'analyzing') &&
    (tool.isFree || credits >= totalCost);

  const mutation = useMutation({
    mutationFn: async () => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = readyFiles[0].previewUrl!;
      });
      const pixels = await loadPixels(img);
      const out = applyDither(pixels.data, pixels.width, pixels.height, {
        mode,
        levels,
        matrixSize,
      });
      const canvas = pixelsToCanvas(out);
      const blob = await canvasToBlob(canvas);
      return URL.createObjectURL(blob);
    },
    onSuccess: (url) => {
      setResultUrl(url);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Dithering applied', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const download = async () => {
    if (!resultUrl) return;
    const res = await fetch(resultUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'dithered.png');
  };

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Image</CardTitle>
            <CardDescription>
              {tool.isFree
                ? 'Free'
                : `${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUploader
              files={files}
              onFilesChange={setFiles}
              batchLimit={10}
              disabled={mutation.isPending}
            />

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Algorithm
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
                >
                  <option value="floyd-steinberg">Floyd–Steinberg</option>
                  <option value="ordered">Ordered (Bayer)</option>
                  <option value="none">None (threshold)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Levels: {levels}
                </label>
                <input
                  type="range"
                  min={2}
                  max={256}
                  step={1}
                  value={levels}
                  onChange={(e) => setLevels(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              {mode === 'ordered' && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Bayer matrix
                  </label>
                  <select
                    value={matrixSize}
                    onChange={(e) => setMatrixSize(Number(e.target.value) as 4 | 8)}
                    className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
                  >
                    <option value={4}>4×4</option>
                    <option value={8}>8×8</option>
                  </select>
                </div>
              )}
            </div>

            <Button
              onClick={() => mutation.mutate()}
              disabled={!canProcess || mutation.isPending}
              className="mt-2"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Apply dithering'
              )}
            </Button>
            {!tool.isFree && credits < totalCost && readyFiles.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                You need {totalCost} credits but have {credits}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Result</CardTitle>
                <CardDescription>Dithered image.</CardDescription>
              </div>
              {resultUrl && (
                <Button variant="outline" size="sm" onClick={download}>
                  <Download className="h-4 w-4" />
                  PNG
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!resultUrl ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No result yet.</p>
              </div>
            ) : (
              <div className="grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="dithered result"
                  className="max-h-[480px] max-w-full rounded-lg border border-border"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
