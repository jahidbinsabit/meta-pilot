'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertCircle, Loader2, Trash2, Download } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob } from '@/lib/tools/client-image';

export function BgRemoverClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [results, setResults] = React.useState<
    { id: string; label: string; url: string; dataUrl: string }[]
  >([]);
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
      const ready = readyFiles;
      const res = await fetch('/api/tools/bg-remover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ready[0].key, fileName: ready[0].name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'bg_removal_failed');
      }
      return res.json();
    },
    onSuccess: async (data: any) => {
      const pngUrl: string = data.pngUrl;
      setResults((prev) => [
        ...prev,
        { id: pngUrl, label: 'background-removed.png', url: pngUrl, dataUrl: pngUrl },
      ]);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: 'Background removed', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
  });

  const downloadOne = async (url: string, label: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    downloadBlob(blob, label);
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
                : `${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'} per image`}
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
                'Remove background'
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
            <CardTitle>Result</CardTitle>
            <CardDescription>Transparent PNG with the background removed.</CardDescription>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No result yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="overflow-hidden rounded-lg border border-border bg-card-2"
                  >
                    <div
                      className="aspect-square grid place-items-center"
                      style={{
                        backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)',
                        backgroundSize: '16px 16px',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.dataUrl}
                        alt={r.label}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-xs text-muted-foreground">{r.label}</span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => downloadOne(r.dataUrl, r.label)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
