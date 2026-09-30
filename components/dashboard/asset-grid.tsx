'use client';

import * as React from 'react';
import { Lock, Sparkles, ArrowRight, ImageOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AssetRow } from '@/lib/adobe-analytics/types';

/** Rows rendered behind the blur on the free tier. */
const BLUR_PLACEHOLDERS = 6;

function contentTypeLabel(t: string): string {
  switch (t) {
    case 'photo':
      return 'Photo';
    case 'vector':
      return 'Vector';
    case 'illustration':
      return 'Illustration';
    case 'video':
      return 'Video';
    case 'template':
      return 'Template';
    case '3d':
      return '3D';
    case 'audio':
      return 'Audio';
    default:
      return t;
  }
}

function Thumb({ asset }: { asset: AssetRow }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !asset.thumbnailUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-850 text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    // Thumbnails come from Adobe's CDN via the API's thumbnail_url field.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.thumbnailUrl}
      alt={asset.title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

export function AssetCard({ asset }: { asset: AssetRow }) {
  return (
    <a
      href={`https://stock.adobe.com/search?k=${encodeURIComponent(asset.title)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-accent/40"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-850">
        <Thumb asset={asset} />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug" title={asset.title}>
          {asset.title}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {asset.contributorName || 'Unknown contributor'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {contentTypeLabel(asset.contentType)}
          </Badge>
          {asset.isGenerativeAi && (
            <Badge variant="info" className="text-[10px]">
              <Sparkles className="mr-1 h-2.5 w-2.5" />
              GenAI
            </Badge>
          )}
          {/* Adobe exposes no per-asset download count, so we never show one. */}
          <span className="ml-auto text-[10px] text-muted-foreground">Downloads: N/A</span>
        </div>
      </div>
    </a>
  );
}

function LockedCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-[4/3] w-full bg-zinc-850" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-full rounded bg-zinc-800" />
        <div className="h-3 w-2/3 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

interface Props {
  assets: AssetRow[];
  hiddenCount: number;
  limit: number;
  planName: string;
  tier: string;
  locked: boolean;
}

export function AssetGrid({ assets, hiddenCount, limit, planName, tier, locked }: Props) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}

        {locked &&
          Array.from({ length: Math.min(BLUR_PLACEHOLDERS, Math.max(3, hiddenCount)) }).map(
            (_, i) => (
              <div key={`locked-${i}`} className="relative">
                <div className="pointer-events-none select-none blur-md">
                  <LockedCard />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground/70" />
                </div>
              </div>
            ),
          )}
      </div>

      {locked && hiddenCount > 0 && (
        <UpgradeGate hiddenCount={hiddenCount} limit={limit} planName={planName} tier={tier} />
      )}
    </div>
  );
}

function UpgradeGate({
  hiddenCount,
  limit,
  planName,
  tier,
}: {
  hiddenCount: number;
  limit: number;
  planName: string;
  tier: string;
}) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
        <Lock className="h-4 w-4 text-accent" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">
        {hiddenCount.toLocaleString()} more result{hiddenCount === 1 ? '' : 's'} locked
      </h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        The {planName} plan shows the top {limit} results. Upgrade to unlock the full result set and
        the complete trend analysis.
      </p>
      <Button asChild size="sm" className="mt-4">
        <a href="/dashboard/billing">
          Upgrade plan
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
}

/** Compact variant used by the "top performing" panel. */
export function AssetList({ assets }: { assets: AssetRow[] }) {
  if (!assets.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No assets to show.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {assets.map((a, i) => (
        <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-850">
            <Thumb asset={a} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={a.title}>
              {a.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {a.contributorName || 'Unknown contributor'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {contentTypeLabel(a.contentType)}
            </Badge>
            {a.isGenerativeAi && (
              <Badge variant="info" className="text-[10px]">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                AI
              </Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({
  label,
  value,
  hint,
  isEstimated,
  exact,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  isEstimated?: boolean;
  exact?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {isEstimated ? (
            <Badge variant="warning" className="text-[10px]">
              Estimated
            </Badge>
          ) : exact ? (
            <Badge variant="success" className="text-[10px]">
              Adobe
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300',
      )}
    >
      {children}
    </div>
  );
}
