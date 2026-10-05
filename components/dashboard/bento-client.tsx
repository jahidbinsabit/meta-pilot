'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  AlertCircle,
  Loader2,
  Download,
  GripVertical,
  Trash2,
  Plus,
  LayoutGrid,
} from 'lucide-react';
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
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const removeCell = (id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  };

  const exportPng = async () => {
    if (cells.length === 0) {
      toast({ title: 'Add images first', variant: 'error' });
      return;
    }
    const canvas = document.createElement('canvas');
    const cellSize = 300;
    const cols = Math.min(columns, cells.length);
    const rows = Math.ceil(cells.length / cols);
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < cells.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, col * cellSize, row * cellSize, cellSize, cellSize);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = cells[i].url;
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
                <CardTitle>Bento grid</CardTitle>
                <CardDescription>
                  {cells.length} cell{cells.length === 1 ? '' : 's'} · {columns} columns
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
                {cells.map((c) => (
                  <div
                    key={c.id}
                    className="group relative overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt={c.name} className="aspect-square w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-between bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="ml-2 truncate text-xs text-foreground">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCell(c.id)}
                        className="mr-2 rounded p-1 text-destructive-foreground hover:bg-destructive/20"
                        aria-label={`Remove ${c.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
