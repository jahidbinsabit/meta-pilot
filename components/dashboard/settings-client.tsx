'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { Badge } from '@/components/ui/badge';
import { UserApiKeysForm } from '@/components/dashboard/user-api-keys-dialog';
import { Key, Copy, Check, Trash2, Plus, Sparkles } from 'lucide-react';

export function SettingsClient() {
  const [keys, setKeys] = React.useState<any[]>([]);
  const [name, setName] = React.useState('');
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setKeys((prev) => [...prev, data.record]);
      setName('');
      toast({ title: 'API key created', variant: 'success' });
    },
    onError: () => toast({ title: 'Failed to create key', variant: 'error' }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
    onSuccess: () => {
      setKeys((prev) => prev.filter((k) => !k.revoked));
      toast({ title: 'Key revoked', variant: 'success' });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">API Keys &amp; Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure personal AI provider keys or manage developer API keys.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>AI Provider Keys (BYOK)</CardTitle>
              <CardDescription>
                Use your personal Gemini, Grok, or OpenAI API keys for direct speed and dedicated quotas.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <UserApiKeysForm />
        </CardContent>
      </Card>

      <div className="pt-4">
        <h2 className="font-display text-lg font-bold">StockForge API Keys</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Create keys to access StockForge AI from your own tools and scripts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a key</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My integration"
          />
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </CardContent>
        {createdKey && (
          <CardContent>
            <div className="rounded-lg border border-border bg-card-2 p-3">
              <p className="text-xs text-muted-foreground">
                Copy this key now — it won't show again.
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate font-mono text-sm">{createdKey}</code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>{keys.length} active key(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No keys yet.</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {k.key.slice(0, 8)}…{k.key.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => revoke.mutate(k.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
