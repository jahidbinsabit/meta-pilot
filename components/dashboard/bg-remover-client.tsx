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
import { AlertCircle, Loader2, Download } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob } from '@/lib/tools/client-image';

/** Per-file processing outcome, keyed by UploadedFile.id. */
type FileOutcome =
  | { status: 'processing' }
  | { status: 'done'; url: string }
  | { status: 'error'; error: string };

function resultName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}-no-bg.png`;
}

export function BgRemoverClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [outcomes, setOutcomes] = React.useState<Record<string, FileOutcome>>({});
  const toast = useToast();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  const { readyFiles, credits, unlimited } = useToolGating(files, tool);
  const queryClient = useQueryClient();

  // Only files without a completed result are (re)processed: a second click
  // retries failed/pending files and never re-charges finished ones, and the
  // gate/price below covers exactly the files that will actually be charged.
  const pendingFiles = readyFiles.filter((f) => outcomes[f.id]?.status !== 'done');
  const pendingCost = pendingFiles.length * tool.creditCost;
  const canRun =
    pendingFiles.length > 0 &&
    !files.some((f) => f.status === 'analyzing') &&
    (tool.isFree || unlimited || credits >= pendingCost);
  const processedFiles = files.filter((f) => outcomes[f.id]);

  const removeOne = async (file: UploadedFile): Promise<string> => {
    const res = await fetch('/api/tools/bg-remover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: file.key, fileName: file.name }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'bg_removal_failed');
    }
    const data = await res.json();
    return data.pngUrl as string;
  };

  const mutation = useMutation({
    mutationFn: async (targets: UploadedFile[]) => {
      let done = 0;
      let failed = 0;
      for (const file of targets) {
        setOutcomes((prev) => ({ ...prev, [file.id]: { status: 'processing' } }));
        try {
          const url = await removeOne(file);
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
            [file.id]: { status: 'error', error: e?.message || 'bg_removal_failed' },
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
            summary.total > 1 ? `Backgrounds removed (${summary.done})` : 'Background removed',
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
            <Button onClick={() => mutation.mutate(pendingFiles)} disabled={!canRun || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remove background'
              )}
            </Button>
            {!tool.isFree && !unlimited && credits < pendingCost && pendingFiles.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                You need {pendingCost} credits but have {credits}.
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
            {processedFiles.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No result yet.</p>
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
                          <div
                            className="aspect-square grid place-items-center"
                            style={{
                              backgroundImage:
                                'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)',
                              backgroundSize: '16px 16px',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={o.url}
                              alt={resultName(f.name)}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {resultName(f.name)}
                            </span>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => downloadOne(o.url, resultName(f.name))}
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
