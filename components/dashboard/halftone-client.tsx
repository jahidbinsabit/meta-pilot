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
import { applyHalftone } from '@/lib/tools/halftone';

export function HalftoneClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [dotSize, setDotSize] = React.useState(6);
  const [angle, setAngle] = React.useState(15);
  const [colorMode, setColorMode] = React.useState<'monochrome' | 'color'>('color');
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const toast = useToast();
  const { credits } = useCredits();
  const queryClient = useQueryClient();

  const readyFiles = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl));
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
      const out = applyHalftone(pixels.data, pixels.width, pixels.height, {
        dotSize,
        angle,
        colorMode,
      });
      const canvas = pixelsToCanvas(out);
      const blob = await canvasToBlob(canvas);
      return URL.createObjectURL(blob);
    },
    onSuccess: (url) => {
      setResultUrl(url);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Halftone applied', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const download = async () => {
    if (!resultUrl) return;
    const res = await fetch(resultUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'halftone.png');
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
                  Dot size: {dotSize}px
                </label>
                <input
                  type="range"
                  min={2}
                  max={24}
                  value={dotSize}
                  onChange={(e) => setDotSize(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Screen angle: {angle}°
                </label>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Color mode
                </label>
                <select
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value as any)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
                >
                  <option value="color">Color</option>
                  <option value="monochrome">Monochrome</option>
                </select>
              </div>
            </div>

            <Button
              onClick={() => mutation.mutate()}
              disabled={!canProcess || mutation.isPending}
              className="mt-2"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply halftone'}
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
                <CardDescription>Halftone-dot filtered image.</CardDescription>
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
                  alt="halftone result"
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
