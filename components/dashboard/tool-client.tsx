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

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function CsvBlock({ csv }: { csv: string }) {
  const [copiedCsv, setCopiedCsv] = React.useState(false);
  const copyCsv = async () => {
    await navigator.clipboard.writeText(csv);
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 1500);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          CSV
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copyCsv}>
          {copiedCsv ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiedCsv ? 'Copied' : 'Copy CSV'}
        </Button>
      </div>
      <pre className="overflow-auto rounded-lg border border-border bg-card-2 p-3 font-mono text-[11px] leading-relaxed">
        {csv}
      </pre>
    </div>
  );
}

/** Recursive value renderer: objects → key/value rows, arrays → lists/blocks. */
function ValueView({ value }: { value: any }): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'string') {
    if (value.includes('\n')) {
      return (
        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">
          {value}
        </pre>
      );
    }
    return <span className="break-words">{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return (
        <ul className="list-inside list-disc space-y-0.5">
          {value.map((v, i) => (
            <li key={i}>{v === null || v === undefined ? '—' : String(v)}</li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-lg border border-border bg-card-2 p-2.5">
            <ValueView value={v} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return <KeyValueRows obj={value} />;
  }
  return <span>{String(value)}</span>;
}

function KeyValueRows({ obj }: { obj: Record<string, any> }) {
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[112px_1fr] items-start gap-2 text-xs">
          <span className="pt-px font-medium text-muted-foreground">{humanizeKey(key)}</span>
          <div className="min-w-0">
            <ValueView value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Readable result renderer (raw JSON is only a fallback for shapes the
 * generic walker can't represent). A `csv` string field gets its own
 * monospace block + copy button; the remaining fields render as rows.
 */
function ResultView({ result }: { result: any }) {
  if (typeof result === 'string') {
    return (
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-card-2 p-3 font-sans text-xs leading-relaxed">
        {result}
      </pre>
    );
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const { csv, ...rest } = result as Record<string, any>;
    return (
      <div className="space-y-3">
        {Object.keys(rest).length > 0 && <KeyValueRows obj={rest} />}
        {typeof csv === 'string' && <CsvBlock csv={csv} />}
        {typeof csv !== 'string' && Object.keys(rest).length === 0 && (
          <ValueView value={result} />
        )}
      </div>
    );
  }
  if (result && typeof result === 'object') {
    return <ValueView value={result} />;
  }
  // Unknown primitive shape — raw fallback.
  return (
    <pre className="overflow-auto rounded-lg border border-border bg-card-2 p-3 text-xs">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

export function ToolClient({ slug, tool }: { slug: string; tool: ToolEntry }) {
  const [input, setInput] = React.useState('');
  const [result, setResult] = React.useState<null | any>(null);
  const [copied, setCopied] = React.useState(false);
  const { credits, unlimited } = useCredits();
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
  const canRun = input.trim().length > 0 && !mutation.isPending && (cost === 0 || unlimited || credits >= cost);

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
            {cost > 0 && !unlimited && credits < cost && (
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
              <div className="max-h-[420px] overflow-auto pr-1">
                <ResultView result={result} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
