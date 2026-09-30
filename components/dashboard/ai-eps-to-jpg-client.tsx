'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, Download, FileImage, AlertCircle } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob } from '@/lib/tools/client-image';

export function AiEpsToJpgClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const [width, setWidth] = React.useState(2000);
  const toast = useToast();
  const { credits } = useCredits();
  const queryClient = useQueryClient();

  const readyFiles = files.filter((f) => f.status === 'done' && f.previewUrl);
  const canProcess = readyFiles.length > 0 && !files.some((f) => f.status === 'analyzing');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tools/ai-eps-to-jpg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: readyFiles[0].key,
          fileName: readyFiles[0].name,
          width,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'convert_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResultUrl(data.jpgUrl);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Converted to JPG', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const download = async () => {
    if (!resultUrl) return;
    const res = await fetch(resultUrl);
    const blob = await res.blob();
    downloadBlob(blob, 'converted.jpg');
  };

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vector file</CardTitle>
            <CardDescription>Upload an AI, EPS, or SVG file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUploader
              files={files}
              onFilesChange={setFiles}
              batchLimit={5}
              disabled={mutation.isPending}
            />
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Output width: {width}px
              </label>
              <input
                type="range"
                min={256}
                max={4000}
                step={64}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <Button onClick={() => mutation.mutate()} disabled={!canProcess || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Convert to JPG'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Result</CardTitle>
                <CardDescription>Free utility — no credit cost.</CardDescription>
              </div>
              {resultUrl && (
                <Button variant="outline" size="sm" onClick={download}>
                  <Download className="h-4 w-4" />
                  JPG
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!resultUrl ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <FileImage className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">Converted JPG will appear here.</p>
              </div>
            ) : (
              <div className="grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="converted"
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
