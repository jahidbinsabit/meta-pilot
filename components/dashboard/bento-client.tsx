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
import { AlertCircle, Loader2, Download, Trash2, Plus, LayoutGrid, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { downloadBlob, canvasToBlob } from '@/lib/tools/client-image';

interface BentoCell {
  id: string;
  url: string;
  name: string;
  span: number; // 1-4, grid-column span
}

export function BentoClient({ tool }: { tool: ToolEntry }) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [cells, setCells] = React.useState<BentoCell[]>([]);
  const [columns, setColumns] = React.useState(3);
  const toast = useToast();
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  const { readyFiles, totalCost, canProcess, credits, unlimited } = useToolGating(files, tool);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const ready = readyFiles;
      return ready.map((f) => ({
        id: f.id,
        url: f.previewUrl!,
        name: f.name,
        span: 1,
      }));
    },
    onSuccess: (newCells) => {
      setCells((prev) => [...prev, ...newCells]);
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      toast({ title: `${newCells.length} image(s) added to bento`, variant: 'success' });
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

  const removeCell = (id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  };

  // T3-07: `span` used to be dead model data — set at creation, rendered
  // nowhere, unchangeable. Cells can now be widened/narrowed (1–4,
  // clamped to the column count) and reordered; the preview grid and
  // the PNG export both lay out with the same row-packing.
  const changeSpan = (id: string, delta: number) => {
    setCells((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, span: Math.max(1, Math.min(4, columns, c.span + delta)) } : c,
      ),
    );
  };

  const moveCell = (id: string, dir: -1 | 1) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const exportPng = async () => {
    if (cells.length === 0) {
      toast({ title: 'Add images first', variant: 'error' });
      return;
    }
    const canvas = document.createElement('canvas');
    const cellSize = 300;
    const cols = Math.min(columns, cells.length);

    // Row-pack the cells honouring each span (same layout as the
    // preview grid): a cell that doesn't fit in the remaining columns
    // wraps to the next row.
    const placements: { cell: BentoCell; x: number; y: number; w: number }[] = [];
    let cx = 0;
    let cy = 0;
    for (const cell of cells) {
      const w = Math.max(1, Math.min(cell.span, cols));
      if (cx + w > cols) {
        cx = 0;
        cy += 1;
      }
      placements.push({ cell, x: cx, y: cy, w });
      cx += w;
      if (cx >= cols) {
        cx = 0;
        cy += 1;
      }
    }
    const rows = placements.reduce((max, p) => Math.max(max, p.y), 0) + 1;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const p of placements) {
      const targetW = p.w * cellSize;
      const targetH = cellSize;
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          // Cover-crop the source into the (possibly wide) cell box.
          const targetAspect = targetW / targetH;
          const srcAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
          let sx = 0;
          let sy = 0;
          let sw = img.naturalWidth;
          let sh = img.naturalHeight;
          if (srcAspect > targetAspect) {
            sw = img.naturalHeight * targetAspect;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / targetAspect;
            sy = (img.naturalHeight - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, p.x * cellSize, p.y * cellSize, targetW, targetH);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = p.cell.url;
      });
    }

    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, 'bento-grid.png');
    toast({ title: 'Bento exported', variant: 'success' });
  };

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
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
              batchLimit={20}
              disabled={mutation.isPending}
            />
            <Button onClick={() => mutation.mutate()} disabled={!canProcess || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add to bento
                </>
              )}
            </Button>
            {!tool.isFree && !unlimited && credits < totalCost && readyFiles.length > 0 && (
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
                <CardTitle>Bento grid</CardTitle>
                <CardDescription>
                  {cells.length} cell{cells.length === 1 ? '' : 's'} · {columns} columns
                  {cells.length > 0 ? ' · hover a cell to resize or reorder' : ''}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={columns}
                  onChange={(e) => setColumns(Number(e.target.value))}
                  className="rounded-lg border border-input bg-background/60 px-2 py-1.5 text-xs"
                >
                  <option value={2}>2 cols</option>
                  <option value={3}>3 cols</option>
                  <option value={4}>4 cols</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportPng}
                  disabled={cells.length === 0}
                >
                  <Download className="h-4 w-4" />
                  PNG
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {cells.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <LayoutGrid className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">Add images to build your bento grid.</p>
              </div>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
              >
                {cells.map((c, idx) => {
                  const effSpan = Math.max(1, Math.min(c.span, columns));
                  return (
                    <div
                      key={c.id}
                      className="group relative overflow-hidden rounded-lg border border-border"
                      style={{
                        gridColumn: `span ${effSpan}`,
                        aspectRatio: `${effSpan} / 1`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url} alt={c.name} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex flex-col justify-between bg-black/50 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="truncate text-xs text-foreground">{c.name}</span>
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveCell(c.id, -1)}
                              disabled={idx === 0}
                              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                              aria-label={`Move ${c.name} earlier`}
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCell(c.id, 1)}
                              disabled={idx === cells.length - 1}
                              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                              aria-label={`Move ${c.name} later`}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => changeSpan(c.id, -1)}
                              disabled={c.span <= 1}
                              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                              aria-label={`Make ${c.name} narrower`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-6 text-center text-[11px] font-medium text-white">
                              {effSpan}×
                            </span>
                            <button
                              type="button"
                              onClick={() => changeSpan(c.id, 1)}
                              disabled={c.span >= Math.min(4, columns)}
                              className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                              aria-label={`Make ${c.name} wider`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCell(c.id)}
                            className="rounded p-1 text-destructive-foreground hover:bg-destructive/20"
                            aria-label={`Remove ${c.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
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
