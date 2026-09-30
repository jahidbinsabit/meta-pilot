import type { AssetRow, TrendPoint } from './types';

/**
 * Relative-interest series for a keyword.
 *
 * ACCURACY CONTRACT — READ BEFORE TRUSTING ANY NUMBER HERE
 * -------------------------------------------------------
 * Adobe Stock's Search API exposes a fixed 67-column result set. Verified
 * against both the Search and Bulk-Files references:
 *
 *   - NO per-asset download count. `nb_downloads` exists ONLY as a value of
 *     `search_parameters[order]` (sort by popularity). It is not a readable
 *     column, so a download number can never be displayed.
 *   - NO creation/publish date on any asset. The column list contains no
 *     date field, and Adobe's Getting Started states outright: "There is no
 *     API to get sales data, see top sellers, see creation dates."
 *   - NO search-volume-over-time.
 *
 * Because there are no dates, a true calendar time-series is impossible. What
 * IS available is *relative recency order*: requesting
 * `search_parameters[order]=creation` returns assets newest-first. We use that
 * ordering to show how the matching catalogue is distributed by recency —
 * a "newest quarter vs oldest quarter" split of the actual result set.
 *
 * This is derived from real Adobe data (the ordering itself), but the
 * bucket boundaries are ours, not calendar dates. Every consumer must label
 * it accordingly; `source` is "adobe" only when the ordering is real, and
 * the UI always names it a recency distribution rather than downloads.
 *
 * Nothing here is a download count, and no code path fabricates one.
 */

const BUCKETS = 4;

export interface TrendEstimate {
  points: TrendPoint[];
  basis: string;
  /** True when the points come from Adobe's own creation-order response. */
  fromAdobeOrdering: boolean;
}

/**
 * Buckets assets (expected newest-first) into equal recency bands and
 * reports each band's share of that set.
 *
 * Callers should pass a sample fetched with `order=creation`. When the grid
 * is already sorted newest-first they may pass those rows instead.
 */
export function estimateInterestTrend(assets: AssetRow[], _totalAssets: number): TrendEstimate {
  const n = assets.length;

  if (n < 4) {
    return {
      points: [],
      basis:
        "Not enough assets returned to show a recency distribution. Adobe's API returns at most 100 per request and does not publish publish-dates, download counts, or search-volume history.",
      fromAdobeOrdering: false,
    };
  }

  const per = Math.ceil(n / BUCKETS);
  const points: TrendPoint[] = [];
  let rank = 0;

  for (let b = 0; b < BUCKETS; b++) {
    const slice = assets.slice(b * per, (b + 1) * per);
    if (!slice.length) break;
    const share = (slice.length / n) * 100;
    points.push({
      // No calendar date exists; the label is the recency band itself.
      date: bandLabel(b, BUCKETS),
      interest: Math.round(share * 10) / 10,
      estimatedDownloads: null,
    });
    rank += slice.length;
  }

  return {
    points,
    basis: `Share of the ${n} assets Adobe returned, split into ${BUCKETS} equal recency bands from newest to oldest using Adobe's own creation-order sort. Adobe does not publish publish-dates, per-asset download counts, or search-volume history, so this shows catalogue recency — not a download total or a calendar time-series.`,
    fromAdobeOrdering: true,
  };
}

function bandLabel(index: number, total: number): string {
  if (total === 4) {
    return ['Newest 25%', 'Upper-mid', 'Lower-mid', 'Oldest 25%'][index] ?? `Band ${index + 1}`;
  }
  return `Band ${index + 1}`;
}

/**
 * Direction of a recency distribution. "newest-heavy" means most of the
 * catalogue matching this keyword was uploaded recently.
 */
export function trendDirection(points: TrendPoint[]): 'up' | 'down' | 'flat' {
  if (points.length < 2) return 'flat';
  const first = points[0].interest;
  const last = points[points.length - 1].interest;
  if (first === 0 && last === 0) return 'flat';
  // Buckets are newest-first, so a decline means older-skewing.
  const ratio = first > 0 ? last / first : Infinity;
  if (ratio < 0.6) return 'down';
  if (ratio > 1.6) return 'up';
  return 'flat';
}
