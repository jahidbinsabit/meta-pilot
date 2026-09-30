'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check } from 'lucide-react';
import { ToolShell } from '@/components/dashboard/tool-shell';
import { ResultsList } from '@/components/dashboard/tool-results';
import type { ToolEntry } from '@/lib/tools/registry';

const TOOLS: Record<string, { title: string; desc: string; cost: number }> = {
  'keyword-clustering': {
    title: 'Keyword Clustering',
    desc: 'Group overlapping keywords into themes.',
    cost: 1,
  },
  'title-ab': { title: 'Title A/B', desc: 'Generate title variants and compare SEO fit.', cost: 1 },
  'alt-text': { title: 'Alt Text', desc: 'Write accessible alt text for your images.', cost: 1 },
  palette: { title: 'Color Palette', desc: 'Extract a color palette from an image.', cost: 1 },
  'keyword-density': {
    title: 'Keyword Density',
    desc: 'Check keyword usage across a listing.',
    cost: 1,
  },
  'contrast-checker': {
    title: 'Contrast Checker',
    desc: 'Verify text/background contrast.',
    cost: 1,
  },
  'batch-export': { title: 'Batch Export', desc: 'Export metadata in CSV / JSON.', cost: 0 },
};

export function ToolClient({ slug, tool }: { slug: string; tool: ToolEntry }) {
  const [input, setInput] = React.useState('');
  const [result, setResult] = React.useState<null | any>(null);
  const [copied, setCopied] = React.useState(false);
  const { credits } = useCredits();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tools/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, input }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'tool_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data.result ?? data);
      toast({ title: 'Done', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const cost = tool.creditCost;
  const canRun = input.trim().length > 0 && !mutation.isPending && (cost === 0 || credits >= cost);

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>
              {cost === 0 ? 'Free' : `${cost} credit${cost === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste keywords, titles, or text here..."
              className="min-h-[140px]"
            />
            <Button onClick={() => mutation.mutate()} disabled={!canRun}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Run tool
            </Button>
            {cost > 0 && credits < cost && (
              <p className="text-xs text-amber-400">
                You need {cost} credits but have {credits}. Top up in Billing.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Output</CardTitle>
              {result && (
                <Button variant="outline" size="sm" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">Output will appear here.</p>
              </div>
            ) : (
              <pre className="max-h-[360px] overflow-auto rounded-lg border border-border bg-card-2 p-3 text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
