'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Info, Infinity as InfinityIcon } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

interface PlanLimit {
  id: string;
  name: string;
  tier: string;
  adobeAnalyticsResultLimit: number;
  isActive: boolean;
}

const UNLIMITED = -1;
const PAGE_SIZE = 100;

/**
 * Mirrors the server gate (lib/adobe-analytics/tiers.ts): a stored 0 is
 * the "not configured" sentinel and falls back per tier — FREE falls
 * back to one full page.
 */
function effectiveRows(plan: PlanLimit): number {
  const stored = plan.adobeAnalyticsResultLimit;
  if (stored === UNLIMITED) return UNLIMITED;
  if (stored > 0) return stored;
  switch (plan.tier) {
    case 'PRO':
      return 100;
    case 'PLUS':
      return 500;
    case 'AGENCY':
    case 'ENTERPRISE':
      return UNLIMITED;
    case 'FREE':
    default:
      return PAGE_SIZE;
  }
}

function pagesLabel(rows: number): string {
  if (rows === UNLIMITED) return 'Unlimited pages';
  const pages = rows / PAGE_SIZE;
  return Number.isInteger(pages)
    ? `${pages} page${pages === 1 ? '' : 's'} · ${rows.toLocaleString()} results`
    : `${rows.toLocaleString()} results (custom row limit)`;
}

export function AdobeAnalyticsLimits() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'adobe-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/adobe-analytics', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load plan limits');
      return res.json();
    },
  });

  const mutation = useMutation<
    { name: string; tier: string; pages: number; adobeAnalyticsResultLimit: number },
    Error,
    { tier: string; pages: number }
  >({
    mutationFn: async ({ tier, pages }: { tier: string; pages: number }) => {
      const res = await fetch('/api/admin/adobe-analytics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, pages }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = payload?.issues as Record<string, string[]> | undefined;
        throw new Error(
          (issues && Object.values(issues)[0]?.[0]) || payload?.error || 'Save failed',
        );
      }
      return payload;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'adobe-analytics'] });
      setDrafts((d) => {
        const next = { ...d };
        delete next[saved.tier];
        return next;
      });
      toast({
        title: 'Page limit updated',
        description:
          saved.pages === UNLIMITED
            ? `${saved.name} can now browse unlimited pages.`
            : `${saved.name} can now browse ${saved.pages} page${saved.pages === 1 ? '' : 's'} per search (${saved.adobeAnalyticsResultLimit.toLocaleString()} results).`,
        variant: 'success',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save', description: e.message, variant: 'error' }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plan limits…
        </CardContent>
      </Card>
    );
  }

  const plans: PlanLimit[] = data?.plans || [];

  const save = (plan: PlanLimit) => {
    const effective = effectiveRows(plan);
    const raw = (
      drafts[plan.tier] ?? (effective === UNLIMITED ? '' : String(effective / PAGE_SIZE))
    ).trim();
    if (raw === '' || raw.toLowerCase() === 'unlimited') {
      mutation.mutate({ tier: plan.tier, pages: UNLIMITED });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast({
        title: 'Invalid value',
        description: 'Use a whole number of pages (1–1000), or leave blank for unlimited.',
        variant: 'error',
      });
      return;
    }
    mutation.mutate({ tier: plan.tier, pages: n });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adobe Analytics page limits</CardTitle>
        <CardDescription>
          How many pages each plan can browse in Adobe Analytics searches — one page is 100
          results. A plan stops at its page cap; deeper results stay behind the upgrade prompt.
          Changes apply to the next search — no redeploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {plans.map((plan) => {
          const stored = plan.adobeAnalyticsResultLimit;
          const effective = effectiveRows(plan);
          const value =
            drafts[plan.tier] ?? (effective === UNLIMITED ? '' : String(effective / PAGE_SIZE));
          const saving = mutation.isPending && mutation.variables?.tier === plan.tier;

          return (
            <div
              key={plan.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card-2 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{plan.name}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {plan.tier}
                  </Badge>
                  {!plan.isActive && (
                    <Badge variant="muted" className="text-[10px]">
                      inactive
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pagesLabel(effective)}
                  {plan.tier === 'FREE' && stored === 0 && ' (default)'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    value={value}
                    onChange={(e) => setDrafts((d) => ({ ...d, [plan.tier]: e.target.value }))}
                    placeholder="unlimited"
                    inputMode="numeric"
                    className="w-32 pr-8"
                    aria-label={`${plan.name} page limit`}
                  />
                  {effective === UNLIMITED && (
                    <InfinityIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">pages</span>
                <Button size="sm" variant="outline" onClick={() => save(plan)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          );
        })}

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3 w-3 shrink-0" />
          Leave a field blank (or type <span className="font-mono">-1</span>) for unlimited
          pages. This module is gated purely by plan tier and does not consume image-generation
          credits.
        </p>
      </CardContent>
    </Card>
  );
}
