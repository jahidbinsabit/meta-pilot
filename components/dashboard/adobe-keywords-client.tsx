'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check, Download, FileText, Hash } from 'lucide-react';
import type { ToolEntry } from '@/lib/tools/registry';
import { ToolShell } from '@/components/dashboard/tool-shell';

export function AdobeKeywordsClient({ tool }: { tool: ToolEntry }) {
  const [subject, setSubject] = React.useState('');
  const [result, setResult] = React.useState<null | {
    keywords: string[];
    longTail: string[];
    categories: string[];
  }>(null);
  const [copied, setCopied] = React.useState(false);
  const { credits } = useCredits();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tools/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'adobe-keywords', input: subject }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'generation_failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data.result ?? data);
      toast({ title: 'Keywords generated', variant: 'success' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    },
  });

  const canGenerate =
    subject.trim().length > 0 && !mutation.isPending && (tool.isFree || credits >= tool.creditCost);

  const copyAll = async () => {
    if (!result) return;
    const text = [...result.keywords, ...result.longTail].join(', ');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Copied', variant: 'success' });
  };

  const exportCsv = () => {
    if (!result) return;
    const rows = result.keywords.map((k) => `Keyword,${k}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keywords.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', variant: 'success' });
  };

  return (
    <ToolShell tool={tool}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subject</CardTitle>
            <CardDescription>
              {tool.isFree
                ? 'Free'
                : `${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Subject
              </label>
              <Input
                placeholder="e.g. golden hour mountain landscape"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The AI ranks keywords sized for Adobe Stock's 50-keyword limit, split into short-tail
              and long-tail phrases.
            </p>
            <Button onClick={() => mutation.mutate()} disabled={!canGenerate}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Generate keywords'
              )}
            </Button>
            {!tool.isFree && credits < tool.creditCost && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                You need {tool.creditCost} credits but have {credits}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Keywords</CardTitle>
                <CardDescription>AI-ranked for Adobe Stock.</CardDescription>
              </div>
              {result && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyAll}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <FileText className="h-4 w-4" />
                    CSV
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-muted-foreground">
                <Hash className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">Keywords will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Short-tail ({result.keywords.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keywords.map((k: string) => (
                      <Badge key={k} variant="secondary" className="font-normal">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
                {result.longTail.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Long-tail ({result.longTail.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.longTail.map((k: string) => (
                        <Badge key={k} variant="muted" className="font-normal">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {result.categories.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Suggested categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.categories.map((c: string) => (
                        <Badge key={c} variant="info" className="font-normal">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
