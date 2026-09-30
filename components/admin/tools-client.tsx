'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import type { ToolEntry } from '@/lib/tools/registry';

const ICONS = [
  'Wrench',
  'Palette',
  'Image',
  'Type',
  'Hash',
  'Contrast',
  'Download',
  'Eraser',
  'Grid3x3',
  'Calendar',
  'Key',
  'FileImage',
  'Dot',
  'Layers',
  'Sparkles',
];

const CATEGORIES = ['utility', 'creative', 'conversion', 'analytics', 'admin'];

interface Props {
  tools: ToolEntry[];
}

export function ToolsClient({ tools }: Props) {
  const [draft, setDraft] = React.useState<ToolEntry[]>(tools);
  const [dirty, setDirty] = React.useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (next: ToolEntry[]) => {
      const res = await fetch('/api/admin/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'save_failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast({ title: 'Tool registry saved', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const patch = (slug: string, patch: Partial<ToolEntry>) => {
    setDraft((prev) => prev.map((t) => (t.slug === slug ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const reset = () => {
    setDraft(tools);
    setDirty(false);
    toast({ title: 'Changes discarded', variant: 'info' });
  };

  const save = () => mutation.mutate(draft);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Tools
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Tool Registry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable/disable tools sitewide or per-plan. Disabled tools render as locked tiles on the
            grid, not broken links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="outline" size="sm" onClick={reset} disabled={mutation.isPending}>
              <RotateCcw className="h-4 w-4" />
              Discard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            Each row is a real, working page under /dashboard/tools/[slug].
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {draft.map((tool) => (
              <div key={tool.slug} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <span className="text-xs font-semibold">{tool.icon.slice(0, 2)}</span>
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium text-foreground">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tool.slug} · {tool.route}
                  </p>
                </div>
                <select
                  value={tool.icon}
                  onChange={(e) => patch(tool.slug, { icon: e.target.value })}
                  className="rounded-lg border border-input bg-background/60 px-2 py-1 text-xs"
                >
                  {ICONS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                <select
                  value={tool.category}
                  onChange={(e) => patch(tool.slug, { category: e.target.value })}
                  className="rounded-lg border border-input bg-background/60 px-2 py-1 text-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  value={tool.creditCost}
                  onChange={(e) =>
                    patch(tool.slug, {
                      creditCost: Math.max(0, Number(e.target.value) || 0),
                      isFree: Number(e.target.value) === 0,
                    })
                  }
                  className="w-20"
                />
                <Toggle
                  label={tool.isEnabled ? 'Enabled' : 'Disabled'}
                  checked={tool.isEnabled}
                  onChange={(v) =>
                    patch(tool.slug, {
                      isEnabled: v,
                      enabledForTiers: v ? tool.enabledForTiers : [],
                    })
                  }
                />
                <Badge variant={tool.isFree ? 'success' : 'info'} className="text-[10px]">
                  {tool.isFree ? 'Free' : `${tool.creditCost} cr`}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
