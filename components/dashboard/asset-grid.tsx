'use client';

import * as React from 'react';
import {
  Lock,
  Sparkles,
  ArrowRight,
  ImageOff,
  Download,
  Clock,
  User,
  ExternalLink,
  Copy,
  Check,
  Tag,
  Eye,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AssetRow } from '@/lib/adobe-analytics/types';

/** Rows rendered behind the blur on the free tier. */
const BLUR_PLACEHOLDERS = 4;

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
      return t.charAt(0).toUpperCase() + t.slice(1);
  }
}

function formatCount(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
}

/**
 * Helper to compute Adobe Stock ftcdn CDN URLs.
 * Adobe Stock's CDN hashes numeric IDs across 4 two-digit directory segments:
 * E.g., ID 595898688 -> 05/95/89/86/500_F_595898688_abc.jpg
 */
function getAdobeCdnFallbackList(id: number | string): string[] {
  const num = typeof id === 'number' ? id : parseInt(String(id).replace(/\D/g, ''), 10);
  if (!num || isNaN(num) || num <= 1000) return [];
  const padded = String(num).padStart(10, '0');
  const p1 = padded.slice(0, 2);
  const p2 = padded.slice(2, 4);
  const p3 = padded.slice(4, 6);
  const p4 = padded.slice(6, 8);

  return [
    `https://as1.ftcdn.net/v2/jpg/${p1}/${p2}/${p3}/${p4}/500_F_${num}_abc.jpg`,
    `https://as2.ftcdn.net/v2/jpg/${p1}/${p2}/${p3}/${p4}/500_F_${num}_abc.jpg`,
    `https://t4.ftcdn.net/jpg/${p1}/${p2}/${p3}/${p4}/240_F_${num}_abc.jpg`,
    `https://t3.ftcdn.net/jpg/${p1}/${p2}/${p3}/${p4}/240_F_${num}_abc.jpg`,
  ];
}

/**
 * High-res thumbnail component with multi-tier CDN fallback,
 * hotlinking bypass (no-referrer), server proxy fallback, and graceful placeholder.
 */
function AssetThumbnail({ asset }: { asset: AssetRow }) {
  const [stage, setStage] = React.useState<number>(0);
  const [loaded, setLoaded] = React.useState<boolean>(false);

  // Build ordered candidate URL list
  const candidates = React.useMemo(() => {
    const list: string[] = [];
    const addUrl = (url?: string | null) => {
      if (url && typeof url === 'string' && url.startsWith('http') && !list.includes(url)) {
        list.push(url);
      }
    };

    // 1. Primary 500px thumbnail from dataset
    addUrl(asset.thumbnail500Url);

    // 2. Direct verified Adobe Stock CDN URLs (as1, as2, t4, t3)
    const directCdnList = getAdobeCdnFallbackList(asset.id);
    for (const u of directCdnList) {
      addUrl(u);
    }

    // 3. Raw thumbnail from dataset
    addUrl(asset.thumbnailUrl);

    // 4. Server-side proxy fallbacks for direct CDN URLs (bypasses browser adblockers/ISP blocks)
    for (const u of directCdnList.slice(0, 2)) {
      list.push(`/api/adobe-analytics/image-proxy?url=${encodeURIComponent(u)}`);
    }

    return list;
  }, [asset.thumbnail500Url, asset.thumbnailUrl, asset.id]);

  // Reset stage and loading state whenever the asset changes
  React.useEffect(() => {
    setStage(0);
    setLoaded(false);
  }, [asset.id, asset.thumbnail500Url, asset.thumbnailUrl]);

  const currentSrc = candidates[stage];

  const handleError = () => {
    if (stage + 1 < candidates.length) {
      setStage((prev) => prev + 1);
    } else {
      setStage(-1); // all failed
    }
  };

  if (!currentSrc || stage === -1) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 p-4 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card/60 border border-border/50 text-accent mb-2">
          <ImageOff className="h-5 w-5 opacity-70" />
        </div>
        <p className="max-w-[200px] truncate text-xs font-medium text-foreground/80">
          {asset.title || 'Stock Preview'}
        </p>
        <span className="mt-1 text-[11px] text-muted-foreground uppercase tracking-wider font-mono">
          {contentTypeLabel(asset.contentType)}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-zinc-950">
      {/* Loading Skeleton */}
      {!loaded && (
        <div className="absolute inset-0 z-10 animate-pulse bg-muted/30" />
      )}
      {/* Image with no-referrer policy to bypass CDN hotlink protections */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${asset.id}-${currentSrc}`}
        src={currentSrc}
        alt={asset.title}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={cn(
          'h-full w-full object-cover transition-all duration-500 group-hover:scale-105',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

export function AssetCard({ asset }: { asset: AssetRow }) {
  const [copiedId, setCopiedId] = React.useState(false);
  const [copiedKeywords, setCopiedKeywords] = React.useState(false);
  const [showAllKeywords, setShowAllKeywords] = React.useState(false);

  const adobeLink =
    asset.detailsUrl ||
    `https://stock.adobe.com/search?k=${encodeURIComponent(asset.title)}`;

  const contributorUrl = asset.contributorId
    ? `https://stock.adobe.com/contributor/${asset.contributorId}`
    : null;

  const handleCopyId = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(asset.id));
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyKeywords = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (asset.keywords && asset.keywords.length > 0) {
      navigator.clipboard.writeText(asset.keywords.join(', '));
      setCopiedKeywords(true);
      setTimeout(() => setCopiedKeywords(false), 2000);
    }
  };

  const keywords = asset.keywords || [];
  const displayedKeywords = showAllKeywords ? keywords : keywords.slice(0, 8);

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/75 backdrop-blur-md shadow-sm transition-all duration-300 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5">
      <div>
        {/* Thumbnail Preview Banner */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-950">
          <a
            href={adobeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-full w-full"
            title="Open on Adobe Stock"
          >
            <AssetThumbnail asset={asset} />
          </a>

          {/* Top-Left Floating Badges */}
          <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5 pointer-events-none">
            <span className="inline-flex items-center rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-md shadow-sm">
              {contentTypeLabel(asset.contentType)}
            </span>
            {asset.isGenerativeAi && (
              <span className="inline-flex items-center rounded-md border border-accent/30 bg-accent/90 px-2 py-0.5 text-xs font-bold text-accent-foreground backdrop-blur-md shadow-sm">
                <Sparkles className="mr-1 h-3 w-3" />
                AI
              </span>
            )}
          </div>

          {/* Top-Right Asset ID Badge with Copy */}
          <div className="absolute right-3 top-3 z-20">
            <button
              type="button"
              onClick={handleCopyId}
              title="Copy Asset ID"
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-2 py-0.5 font-mono text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
            >
              {copiedId ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <span>#{asset.id}</span>
                  <Copy className="h-2.5 w-2.5 opacity-60" />
                </>
              )}
            </button>
          </div>

          {/* Dimensions / Views overlay at bottom of thumbnail */}
          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5">
            {typeof asset.downloads === 'number' && (
              <span className="inline-flex items-center rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-md shadow-sm">
                <Download className="mr-1 h-3 w-3" />
                {formatCount(asset.downloads)}
              </span>
            )}
            {typeof asset.views === 'number' && (
              <span className="inline-flex items-center rounded-md bg-indigo-600/90 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-md shadow-sm">
                <Eye className="mr-1 h-3 w-3" />
                {formatCount(asset.views)}
              </span>
            )}
            {asset.width && asset.height && (
              <span className="inline-flex items-center rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur-md">
                {asset.width} × {asset.height}
              </span>
            )}
          </div>
        </div>

        {/* Card Content Body */}
        <div className="space-y-3.5 p-4 sm:p-5">
          {/* Asset Title */}
          <div>
            <a
              href={adobeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors hover:text-accent sm:text-base"
              title={asset.title}
            >
              {asset.title}
            </a>
          </div>

          {/* Metadata Row: Contributor & Date */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {/* Contributor */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-3 w-3" />
              </div>
              {contributorUrl ? (
                <a
                  href={contributorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium hover:text-accent transition-colors"
                  title={`Contributor ID: ${asset.contributorId}`}
                >
                  {asset.contributorName || `Contributor #${asset.contributorId}`}
                </a>
              ) : (
                <span className="truncate">{asset.contributorName || 'Adobe Contributor'}</span>
              )}
            </div>

            {/* Published Date */}
            {asset.publishedAgo && (
              <div className="flex items-center gap-1 shrink-0 text-muted-foreground/80 font-mono text-[11px]">
                <Clock className="h-3 w-3 opacity-70" />
                <span>{asset.publishedAgo}</span>
              </div>
            )}
          </div>

          {/* Keywords Tag Cloud */}
          {keywords.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Tag className="h-3 w-3 opacity-60" />
                  Keywords ({keywords.length})
                </span>
                <button
                  type="button"
                  onClick={handleCopyKeywords}
                  className="text-[11px] font-medium text-accent hover:underline flex items-center gap-1"
                >
                  {copiedKeywords ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    'Copy all'
                  )}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {displayedKeywords.map((kw, i) => (
                  <span
                    key={`${kw}-${i}`}
                    className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                  >
                    {kw}
                  </span>
                ))}
                {keywords.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllKeywords(!showAllKeywords)}
                    className="inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                  >
                    {showAllKeywords ? 'Show less' : `+${keywords.length - 8} more`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopyKeywords}
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          {copiedKeywords ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
              Copied Tags
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Tags
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-accent hover:text-accent"
          >
            <a href={`/dashboard/generator?prompt=${encodeURIComponent(asset.title)}`}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Generator
            </a>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium border-border/60 hover:border-accent/40"
          >
            <a href={adobeLink} target="_blank" rel="noopener noreferrer">
              <span>Adobe Stock</span>
              <ExternalLink className="ml-1.5 h-3 w-3 opacity-60" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function LockedCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
      <div className="aspect-[16/10] w-full bg-muted/20" />
      <div className="space-y-2 p-4">
        <div className="h-3.5 w-full rounded bg-muted/30" />
        <div className="h-3 w-2/3 rounded bg-muted/30" />
        <div className="mt-3 h-2.5 w-1/2 rounded bg-muted/30" />
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
      {/* Strictly 2-column grid layout per line on md+ screens */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {assets.map((a) => (
          <AssetCard key={a.id} asset={a} />
        ))}

        {locked &&
          Array.from({ length: Math.min(BLUR_PLACEHOLDERS, Math.max(2, hiddenCount)) }).map(
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
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
            <AssetThumbnail asset={a} />
          </div>
          <div className="min-w-0 flex-1">
            <a
              href={a.detailsUrl || `https://stock.adobe.com/images/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium hover:text-accent block"
              title={a.title}
            >
              {a.title}
            </a>
            <p className="truncate text-xs text-muted-foreground">
              {a.contributorName || 'Adobe Contributor'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {a.downloads !== null && (
              <Badge className="bg-emerald-600/90 text-[10px] font-semibold text-white">
                <Download className="mr-0.5 h-2.5 w-2.5" />
                {formatCount(a.downloads)}
              </Badge>
            )}
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
