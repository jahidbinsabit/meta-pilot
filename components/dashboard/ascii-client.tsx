'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, Download, Copy, Check } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { loadPixels } from '@/lib/tools/client-image';
import { buildAscii, asciiToCanvas, charsetPresets, densityPresets } from '@/lib/tools/ascii';
import { downloadBlob, canvasToBlob } from '@/lib/tools/client-image';

export function AsciiClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [ascii, setAscii] = React.useState<string>('');
  const [charset, setCharset] = React.useState('standard');
  const [density, setDensity] = React.useState<'sparse' | 'normal' | 'dense'>('normal');
  const [invert, setInvert] = React.useState(false);
  const [colored, setColored] = React.useState(false);
  const [fontSize, setFontSize] = React.useState(10);
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
      const { data, width, height } = await loadPixels(img);
      return buildAscii(data, width, height, {
        charset: charsetPresets().find((c) => c.slug === charset)?.chars || '@%#*+=-:. ',
        density,
        invert,
        colored,
        fontSize,
      });
    },
    onSuccess: (text) => {
      setAscii(text);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'ASCII art generated', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const copyAll = async () => {
    if (!ascii) return;
    await navigator.clipboard.writeText(ascii);
    toast({ title: 'Copied', variant: 'success' });
  };

  const downloadPng = async () => {
    if (!ascii) return;
    const canvas = asciiToCanvas(ascii, {
      charset,
      density,
      invert,
      colored,
      fontSize,
    });
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, 'ascii-art.png');
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
                  Character set
                </label>
                <select
                  value={charset}
                  onChange={(e) => setCharset(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
                >
                  {charsetPresets().map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Density
                </label>
                <select
                  value={density}
                  onChange={(e) => setDensity(e.target.value as any)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm"
                >
                  {densityPresets().map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.label} ({d.cols} cols)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={invert}
                    onChange={(e) => setInvert(e.target.checked)}
                    className="rounded"
                  />
                  Invert
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={colored}
                    onChange={(e) => setColored(e.target.checked)}
                    className="rounded"
                  />
                  Colored
                </label>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Font size: {fontSize}px
                </label>
                <input
                  type="range"
                  min={6}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>

            <Button
              onClick={() => mutation.mutate()}
              disabled={!canProcess || mutation.isPending}
              className="mt-2"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate ASCII'}
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
                <CardTitle>ASCII art</CardTitle>
                <CardDescription>Export as text or PNG.</CardDescription>
              </div>
              {ascii && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyAll}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadPng}>
                    <Download className="h-4 w-4" />
                    PNG
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!ascii ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">ASCII art will appear here.</p>
              </div>
            ) : (
              <pre className="max-h-[480px] overflow-auto rounded-lg border border-border bg-card-2 p-3 text-xs leading-relaxed">
                {ascii}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
