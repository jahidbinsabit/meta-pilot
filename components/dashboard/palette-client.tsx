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
import { extractPalette } from '@/lib/tools/palette';
import { downloadBlob } from '@/lib/tools/client-image';

export function PaletteClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [palette, setPalette] = React.useState<
    | null
    | {
        hex: string;
        rgb: string;
        count: number;
      }[]
  >(null);
  const [copied, setCopied] = React.useState<string | null>(null);
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
      const { data, width, height } = await loadPixels(img);
      return extractPalette(data, width, height, 8);
    },
    onSuccess: (data) => {
      setPalette(data);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Palette extracted', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(null), 1500);
  };

  const exportCss = () => {
    if (!palette) return;
    const css = palette.map((c, i) => `--color-${i + 1}: ${c.hex};`).join('\n');
    const blob = new Blob([css], { type: 'text/css' });
    downloadBlob(blob, 'palette.css');
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
            <Button onClick={() => mutation.mutate()} disabled={!canProcess || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Extract palette'
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
                <CardTitle>Palette</CardTitle>
                <CardDescription>Dominant colours with hex codes.</CardDescription>
              </div>
              {palette && (
                <Button variant="outline" size="sm" onClick={exportCss}>
                  <Download className="h-4 w-4" />
                  CSS
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!palette ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No palette extracted yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {palette.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => copyHex(c.hex)}
                      className="group flex flex-col overflow-hidden rounded-lg border border-border"
                      aria-label={`Copy ${c.hex}`}
                    >
                      <div
                        className="aspect-square w-full border-b border-black/10"
                        style={{ backgroundColor: c.hex }}
                      />
                      <div className="p-2 text-left">
                        <p className="font-mono text-xs text-foreground">{c.hex}</p>
                        <p className="text-[11px] text-muted-foreground">{c.rgb}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {copied && (
                  <p className="text-xs text-muted-foreground">
                    Copied <span className="font-mono text-foreground">{copied}</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
