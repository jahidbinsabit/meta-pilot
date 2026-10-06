'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, Loader2, Calendar, Info, AlertTriangle, User, Copy, Check, Sparkles, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

import { InterestChart } from './interest-chart';
import { AssetGrid, AssetList, StatTile, WarningNote } from './asset-grid';
import type {
  ContentTypeValue,
  ContributorResult,
  GenerativeAiValue,
  KeywordSearchResult,
  SortValue,
} from '@/lib/adobe-analytics/types';

const SORT_LABELS: Record<SortValue, string> = {
  relevance: 'Relevance',
  newest: 'Newest',
  downloads: 'Downloads',
};

const CONTENT_TYPE_LABELS: Record<ContentTypeValue, string> = {
  all: 'All',
  photo: 'Photos',
  vector: 'Vectors',
  illustration: 'Illustrations',
};

const GENAI_LABELS: Record<GenerativeAiValue, string> = {
  all: 'All',
  include: 'Include AI',
  exclude: 'Exclude AI',
};

const KEYWORD_PRESETS = [
  'Cyberpunk City',
  'Autumn Forest',
  'Isometric 3D Room',
  'Minimalist Logo',
  'Vintage Botanical',
  'AI Character Portrait',
];

const CONTRIBUTOR_PRESETS = [
  { id: '209617558', label: 'The Little Hut (209617558)' },
  { id: '205867021', label: 'TWINS DESIGN (205867021)' },
  { id: '203410118', label: 'nedomacki (203410118)' },
  { id: '206240212', label: 'Master Vector (206240212)' },
];

/** How many top results the free tier sees; mirrors FREE_TIER_RESULT_LIMIT. */
const FREE_LIMIT = 20;

async function postSearch(body: Record<string, unknown>) {
  const res = await fetch('/api/adobe-analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Please sign in again.');
    const issues = data?.issues as Record<string, string[]> | undefined;
    const first = issues && Object.values(issues)[0]?.[0];
    throw new Error(first || data?.error || 'Search failed.');
  }
  return data;
}

function isLocked(result: { limit: number; hiddenCount: number }): boolean {
  return result.hiddenCount > 0 && result.limit !== -1;
}

export function AdobeAnalyticsDashboard() {
  const toast = useToast();
  const [tab, setTab] = React.useState<'keyword' | 'contributor'>('keyword');

  const { data: meta } = useQuery({
    queryKey: ['adobe-analytics', 'meta'],
    queryFn: async () => {
      const res = await fetch('/api/adobe-analytics?limit=8');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const configured = meta?.adobeConfigured !== false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Stock & Market Analytics
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Market Intelligence</h1>
        </div>
        <div className="flex items-center gap-2">
          {configured ? (
            <Badge variant="outline" className="gap-1.5 py-1 text-xs font-medium border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {meta?.scraperEngine === 'apify' ? 'Apify Scraper Engine Active' : 'Stock Search Active'}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 py-1 text-xs font-medium border-amber-500/40 bg-amber-500/10 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Scraper Engine Needs Setup
            </Badge>
          )}
        </div>
      </div>

      {!configured && (
        <WarningNote>
          The Stock Scraper Engine is not configured yet. An administrator can add the{' '}
          <strong>Apify API Token</strong> in{' '}
          <a href="/admin/settings" className="font-medium text-accent underline">
            Admin Settings
          </a>{' '}
          or set <code className="font-mono">APIFY_API_TOKEN</code> in <code className="font-mono">.env</code>.
        </WarningNote>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'keyword' | 'contributor')}>
        <TabsList>
          <TabsTrigger value="keyword">Search by Keyword</TabsTrigger>
          <TabsTrigger value="contributor">Search by Contributor ID</TabsTrigger>
        </TabsList>

        <TabsContent value="keyword">
          <KeywordTab toast={toast} />
        </TabsContent>
        <TabsContent value="contributor">
          <ContributorTab toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KeywordTab({
  toast,
}: {
  toast: (t: {
    title: string;
    description?: string;
    variant: 'success' | 'error' | 'info' | 'warning';
  }) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SortValue>('relevance');
  const [contentType, setContentType] = React.useState<ContentTypeValue>('all');
  const [generativeAi, setGenerativeAi] = React.useState<GenerativeAiValue>('all');
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: {
      query: string;
      sort: SortValue;
      contentType: ContentTypeValue;
      generativeAi: GenerativeAiValue;
    }) => postSearch({ type: 'keyword', ...payload }),
    onSuccess: () => setError(null),
    onError: (e: Error) => {
      setError(e.message);
      toast({ title: 'Search failed', description: e.message, variant: 'error' });
    },
  });

  const result = mutation.data?.result as KeywordSearchResult | undefined;
  const locked = result ? isLocked(result) : false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setError('Enter a keyword');
      return;
    }
    mutation.mutate({ query: q, sort, contentType, generativeAi });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label
                htmlFor="kw"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Keyword
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="kw"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. autumn forest, neon portrait, minimal logo"
                  maxLength={120}
                />
                <Button type="submit" disabled={mutation.isPending} className="shrink-0">
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Search</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sort By
                </Label>
                <Select value={sort} onValueChange={(v) => setSort(v as SortValue)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SORT_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Content Type
                </Label>
                <Select
                  value={contentType}
                  onValueChange={(v) => setContentType(v as ContentTypeValue)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTENT_TYPE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Generative AI
                </Label>
                <Select
                  value={generativeAi}
                  onValueChange={(v) => setGenerativeAi(v as GenerativeAiValue)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GENAI_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Querying Adobe Stock&hellip;
        </div>
      )}

      {result && !mutation.isPending && (
        <>
          {result.warning && <WarningNote>{result.warning}</WarningNote>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Matching assets"
              value={result.totalResults === null ? '—' : result.totalResults.toLocaleString()}
              hint={result.totalIsExact ? 'Reported by Adobe' : 'Not reported'}
              exact={result.totalIsExact}
            />
            <StatTile
              label="Results shown"
              value={result.assets.length.toLocaleString()}
              hint={
                result.limit === -1
                  ? `${result.planName} · unlimited`
                  : `${result.planName} · limit ${result.limit}`
              }
            />
            <StatTile
              label="Top result"
              value={result.assets[0] ? contentBadge(result.assets[0].contentType) : '—'}
              hint={result.assets[0]?.contributorName || 'No results'}
            />
            <StatTile
              label="Download counts"
              value={
                result.downloadsAvailable
                  ? `${result.assets.reduce((sum, a) => sum + (a.downloads || 0), 0).toLocaleString()} DLs`
                  : 'Popularity Ranked'
              }
              hint={
                result.downloadsAvailable
                  ? 'Total downloads across visible assets'
                  : 'Ranked by search relevance & downloads'
              }
            />
          </div>

          <InterestChart
            points={result.trend}
            basis={result.trendBasis}
            source={result.trendSource}
            query={result.query}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Assets</CardTitle>
                <CardDescription>
                  {result.totalIsExact
                    ? `${result.totalResults!.toLocaleString()} assets match "${result.query}"`
                    : `Results for "${result.query}"`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.assets.length ? (
                  <AssetGrid
                    assets={result.assets}
                    hiddenCount={result.hiddenCount}
                    limit={result.limit}
                    planName={result.planName}
                    tier={result.tier}
                    locked={locked}
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No assets matched those filters.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top performing assets</CardTitle>
                  <CardDescription>
                    {result.sort === 'downloads'
                      ? 'Ordered by all-time downloads'
                      : 'Highest-ranked matches'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AssetList assets={result.assets.slice(0, 6)} />
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="mt-px h-3 w-3 shrink-0" />
                    {result.downloadsAvailable
                      ? 'Ranked by downloads and market demand retrieved live from Adobe Stock.'
                      : 'Ranked by search relevance and platform popularity.'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Applied filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Sort by" value={SORT_LABELS[result.sort]} />
                  <Row label="Content type" value={CONTENT_TYPE_LABELS[result.contentType]} />
                  <Row label="Generative AI" value={GENAI_LABELS[result.generativeAi]} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContributorTab({
  toast,
}: {
  toast: (t: {
    title: string;
    description?: string;
    variant: 'success' | 'error' | 'info' | 'warning';
  }) => void;
}) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => postSearch({ type: 'contributor', contributorId: id }),
    onSuccess: () => setError(null),
    onError: (e: Error) => {
      setError(e.message);
      toast({ title: 'Lookup failed', description: e.message, variant: 'error' });
    },
  });

  const result = mutation.data?.result as ContributorResult | undefined;
  const locked = result ? isLocked(result) : false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = value.trim().match(/contributor\/(\d+)/i)?.[1]
      || value.trim().match(/creator_id=(\d+)/i)?.[1]
      || value.trim().match(/(\d+)/)?.[1]
      || value.trim();
    if (!cleaned || !/^\d+$/.test(cleaned)) {
      setError('Enter a valid numeric Contributor ID or profile URL');
      return;
    }
    mutation.mutate(cleaned);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label
                htmlFor="cid"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Contributor ID
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="cid"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. 209617558 or stock.adobe.com/contributor/209617558"
                  maxLength={120}
                />
                <Button type="submit" disabled={mutation.isPending || !value.trim()} className="shrink-0">
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Analyze</span>
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Enter an Adobe Stock Contributor ID or paste their portfolio profile URL.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">Popular creators:</span>
              {CONTRIBUTOR_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setValue(p.id);
                    setError(null);
                    mutation.mutate(p.id);
                  }}
                  className="h-7 text-xs font-normal"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading portfolio&hellip;
        </div>
      )}

      {result && !mutation.isPending && (
        <>
          {result.warning && <WarningNote>{result.warning}</WarningNote>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Total assets"
              value={result.totalAssets === null ? '—' : result.totalAssets.toLocaleString()}
              hint={result.totalIsExact ? 'Reported by Adobe' : 'Not reported'}
              exact={result.totalIsExact}
            />
            <StatTile
              label="Contributor"
              value={result.contributorName || `#${result.contributorId}`}
              hint={`ID ${result.contributorId}`}
            />
            <StatTile
              label="Keywords"
              value={result.aggregate.totalKeywords.toLocaleString()}
              hint="Across the assets returned"
            />
            <StatTile
              label="Assets shown"
              value={result.assets.length.toLocaleString()}
              hint={
                result.limit === -1
                  ? `${result.planName} · unlimited`
                  : `${result.planName} · limit ${result.limit}`
              }
            />
          </div>

          {result.aggregate.byContentType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portfolio breakdown</CardTitle>
                <CardDescription>Content mix of the assets returned by Adobe</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.aggregate.byContentType.map((t) => (
                  <Badge key={t.type} variant="secondary">
                    {contentBadge(t.type)} · {t.count}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio</CardTitle>
              <CardDescription>
                {result.totalIsExact
                  ? `${result.totalAssets!.toLocaleString()} public assets`
                  : 'Public assets returned by Adobe'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.assets.length ? (
                <AssetGrid
                  assets={result.assets}
                  hiddenCount={result.hiddenCount}
                  limit={result.limit}
                  planName={result.planName}
                  tier={result.tier}
                  locked={locked}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No public assets found for contributor #{result.contributorId}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="secondary" className="text-[10px]">
        {value}
      </Badge>
    </div>
  );
}

function contentBadge(t: string): string {
  const map: Record<string, string> = {
    photo: 'Photo',
    vector: 'Vector',
    illustration: 'Illustration',
    video: 'Video',
    template: 'Template',
  };
  return map[t] || t;
}
