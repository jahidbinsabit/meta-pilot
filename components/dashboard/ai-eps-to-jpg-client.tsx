'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useToolGating } from '@/components/dashboard/use-tool-gating';
import { isApiKeyError } from '@/lib/tools/client-api-key';
import { ApiKeyRequiredDialog } from '@/components/dashboard/api-key-required-dialog';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, Download, FileImage, AlertCircle } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob } from '@/lib/tools/client-image';

/** Per-file processing outcome, keyed by UploadedFile.id. */
type FileOutcome =
  | { status: 'processing' }
  | { status: 'done'; url: string }
  | { status: 'error'; error: string };

function jpgName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}.jpg`;
}

export function AiEpsToJpgClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [outcomes, setOutcomes] = React.useState<Record<string, FileOutcome>>({});
  const [width, setWidth] = React.useState(2000);
  const toast = useToast();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  // Free tool (cost 0) — gating still computed via the shared hook for consistency.
  const { readyFiles } = useToolGating(files, tool);
  const queryClient = useQueryClient();

  // Only files without a completed result are (re)processed: a second click
  // retries failed/pending files instead of reconverting finished ones.
  const pendingFiles = readyFiles.filter((f) => outcomes[f.id]?.status !== 'done');
  const canRun =
    pendingFiles.length > 0 && !files.some((f) => f.status === 'analyzing');
  const processedFiles = files.filter((f) => outcomes[f.id]);

  const convertOne = async (file: UploadedFile): Promise<string> => {
    const res = await fetch('/api/tools/ai-eps-to-jpg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: file.key,
        fileName: file.name,
        width,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'convert_failed');
    }
    const data = await res.json();
    return data.jpgUrl as string;
  };

  const mutation = useMutation({
    mutationFn: async (targets: UploadedFile[]) => {
      let done = 0;
      let failed = 0;
      for (const file of targets) {
        setOutcomes((prev) => ({ ...prev, [file.id]: { status: 'processing' } }));
        try {
          const url = await convertOne(file);
          setOutcomes((prev) => ({ ...prev, [file.id]: { status: 'done', url } }));
          done++;
        } catch (e: any) {
          // API key required → abort the batch; the dialog explains why.
          // The in-flight file goes back to pending so it isn't stranded.
          if (isApiKeyError(e?.message)) {
            setOutcomes((prev) => {
              const next = { ...prev };
              delete next[file.id];
              return next;
            });
            throw e;
          }
          setOutcomes((prev) => ({
            ...prev,
            [file.id]: { status: 'error', error: e?.message || 'convert_failed' },
          }));
          failed++;
        }
      }
      return { done, failed, total: targets.length };
    },
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      if (summary.failed === 0) {
        toast({
          title:
            summary.total > 1 ? `Converted ${summary.done} files to JPG` : 'Converted to JPG',
          variant: 'success',
        });
      } else {
        toast({
          title: `${summary.done} done, ${summary.failed} failed`,
          description: 'Failed files stay queued — click again to retry only those.',
          variant: 'error',
        });
      }
    },
    onError: (e: any) => {
      // API key required → show the add-key popup instead of a generic toast.
      // The backend may return "user_api_key_required" as a plain code, a raw
      // JSON string, or an SSE event: data: {"type":"error","error":...}.
      const needsApiKey = isApiKeyError(e?.message);
      if (needsApiKey) {
        setApiKeyDialogOpen(true);
      } else {
        toast({ title: 'Failed', description: e.message, variant: 'error' });
      }
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
            <CardTitle>Vector file</CardTitle>
            <CardDescription>Upload AI, EPS, or SVG files.</CardDescription>
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
            <Button onClick={() => mutation.mutate(pendingFiles)} disabled={!canRun || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Convert to JPG'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>Free utility — no credit cost.</CardDescription>
          </CardHeader>
          <CardContent>
            {processedFiles.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <FileImage className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">Converted JPGs will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {processedFiles.map((f) => {
                  const o = outcomes[f.id];
                  if (!o) return null;
                  return (
                    <div
                      key={f.id}
                      className="overflow-hidden rounded-lg border border-border bg-card-2"
                    >
                      {o.status === 'done' ? (
                        <>
                          <div className="grid place-items-center p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={o.url}
                              alt={jpgName(f.name)}
                              className="max-h-[480px] max-w-full rounded-lg border border-border"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {jpgName(f.name)}
                            </span>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => downloadOne(o.url, jpgName(f.name))}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 p-3 text-sm">
                          {o.status === 'processing' ? (
                            <>
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                              <span className="truncate text-muted-foreground">
                                {f.name} — processing…
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                              <span className="truncate text-muted-foreground">
                                {f.name} — failed: {o.error}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <ApiKeyRequiredDialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen} />
    </ToolShell>
  );
}
