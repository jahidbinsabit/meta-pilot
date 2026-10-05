'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, Download, Layers } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob } from '@/lib/tools/client-image';

export function ImageToPsdClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
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
      const res = await fetch('/api/tools/image-to-psd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: readyFiles[0].key,
          fileName: readyFiles[0].name,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'psd_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResultUrl(data.psdUrl);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Layered PSD created', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
  });

  const download = async () => {
    if (!resultUrl) return;
    const res = await fetch(resultUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'layered.psd');
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
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create PSD'}
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
                <CardTitle>Layered PSD</CardTitle>
                <CardDescription>Background + AI-detected subject layers.</CardDescription>
              </div>
              {resultUrl && (
                <Button variant="outline" size="sm" onClick={download}>
                  <Download className="h-4 w-4" />
                  PSD
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!resultUrl ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <Layers className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">PSD will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card-2 p-3">
                  <p className="text-sm font-medium text-foreground">Layers</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-accent" />
                      Background — full image
                    </li>
                    <li className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-accent" />
                      Subject — separated foreground
                    </li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open the downloaded .psd in Photoshop to inspect or edit the layers.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
