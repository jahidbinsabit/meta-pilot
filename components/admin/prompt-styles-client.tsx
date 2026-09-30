'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Loader2, Plus, Trash2, Save, X } from 'lucide-react';

interface Preset {
  id: string;
  slug: string;
  label: string;
  systemInstruction: string;
  sortOrder: number;
  isActive: boolean;
}

const BLANK: Omit<Preset, 'id'> = {
  slug: '',
  label: '',
  systemInstruction: '',
  sortOrder: 0,
  isActive: true,
};

export function PromptStylesClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = React.useState<Omit<Preset, 'id'> | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const { data: presets, isLoading } = useQuery({
    queryKey: ['admin', 'prompt-styles'],
    queryFn: async () => {
      const res = await fetch('/api/admin/prompt-styles', { cache: 'no-store' });
      if (!res.ok) throw new Error('load_failed');
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async (p: Omit<Preset, 'id'>) => {
      const res = await fetch('/api/admin/prompt-styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'save_failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'prompt-styles'] });
      qc.invalidateQueries({ queryKey: ['prompt-styles'] });
      setDraft(null);
      toast({ title: 'Preset saved', variant: 'success' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'error' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/prompt-styles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'delete_failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'prompt-styles'] });
      qc.invalidateQueries({ queryKey: ['prompt-styles'] });
      toast({ title: 'Preset deleted', variant: 'success' });
    },
    onError: (e: any) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'error' }),
  });

  function edit(p: Preset) {
    setDraft({
      slug: p.slug,
      label: p.label,
      systemInstruction: p.systemInstruction,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Prompt Styles
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Image → Prompt Presets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each preset maps a user-facing label to the system instruction sent to the AI provider.
          Deactivate a preset to retire it from the dashboard dropdown.
        </p>
      </div>

      {draft && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {presets?.some((p: Preset) => p.slug === draft.slug) ? 'Edit preset' : 'New preset'}
              </CardTitle>
              <Button variant="ghost" size="xs" onClick={() => setDraft(null)} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              The system instruction is sent verbatim to the provider, so keep it focused on how the
              prompt should be written.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Label
              </label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Cinematic"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Slug
              </label>
              <Input
                value={draft.slug}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })
                }
                placeholder="cinematic"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                System instruction
              </label>
              <Textarea
                value={draft.systemInstruction}
                onChange={(e) => setDraft({ ...draft, systemInstruction: e.target.value })}
                placeholder="You write prompts for…"
                className="mt-1 min-h-[120px]"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sort order
              </label>
              <Input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div className="flex items-end justify-between gap-2">
              <Toggle
                label="Active"
                checked={draft.isActive}
                onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
              />
              <Button
                onClick={() =>
                  save.mutate({
                    ...draft,
                    slug: draft.slug || draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  })
                }
                disabled={save.isPending || !draft.slug || !draft.systemInstruction.trim()}
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save preset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="subtle"
          onClick={() => setDraft({ ...BLANK, sortOrder: presets?.length || 0 })}
        >
          <Plus className="h-4 w-4" />
          New preset
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading presets…</p>
      ) : !presets?.length ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">No presets yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {presets.map((p: Preset) => (
            <Card key={p.id}>
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{p.label}</p>
                    <Badge variant="muted" className="font-mono text-[10px]">
                      {p.slug}
                    </Badge>
                    <Badge variant={p.isActive ? 'success' : 'muted'}>
                      {p.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {p.systemInstruction}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="xs" onClick={() => edit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setDeleting(p.id)}
                    aria-label={`Delete ${p.label}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
              {deleting === p.id && (
                <CardContent className="flex items-center justify-between gap-3 border-t border-border bg-destructive/5 p-4">
                  <p className="text-xs text-destructive">
                    Delete “{p.label}”? Users can no longer select it.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="xs" onClick={() => setDeleting(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => remove.mutate(p.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
