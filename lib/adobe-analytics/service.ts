import { prisma } from '@/lib/db';
import {
  searchAdobeStock,
  isAdobeConfigured,
  isConfigurationError,
  mapOrder,
  AdobeStockError,
  type AdobeFile,
  type AdobeSearchParams,
} from './adobe-stock';
import { estimateInterestTrend } from './trend';
import { applyRowGate, getAnalyticsGate, isUnlimited } from './tiers';
import type {
  AssetRow,
  ContentTypeValue,
  ContributorResult,
  GenerativeAiValue,
  KeywordSearchResult,
  SortValue,
} from './types';

/** One page request to Adobe. */
const PAGE_SIZE = 100;

/**
 * Ceiling for unlimited tiers. Adobe caps a page at 100, so "unlimited"
 * still means "show me a large, useful sample" rather than paging the entire
 * catalog — this keeps one search from issuing unbounded upstream calls.
 */
const UNLIMITED_FETCH_CEILING = 500;

/**
 * How many creation-ordered assets to pull for the recency chart. A modest
 * sample is enough to read the recency mix and costs one extra request.
 */
const RECENCY_SAMPLE_SIZE = 50;

function toAssetRow(f: AdobeFile): AssetRow {
  return {
    id: f.id,
    title: f.title || 'Untitled',
    contentType: f.content_type || 'unknown',
    thumbnailUrl: f.thumbnail_url || null,
    contributorId: typeof f.creator_id === 'number' ? f.creator_id : null,
    contributorName: f.creator_name || null,
    width: typeof f.width === 'number' ? f.width : null,
    height: typeof f.height === 'number' ? f.height : null,
    keywords: Array.isArray(f.keywords) ? f.keywords : [],
    isGenerativeAi: f.is_gentech === true,
    // Adobe exposes no readable per-asset download count. Never populated.
    downloads: null,
  };
}

function contentTypeFilters(contentType: ContentTypeValue): AdobeSearchParams['filters'] {
  return {
    contentTypePhoto: contentType === 'photo',
    contentTypeVector: contentType === 'vector',
    contentTypeIllustration: contentType === 'illustration',
  };
}

function gentechFilter(generativeAi: GenerativeAiValue): boolean | undefined {
  if (generativeAi === 'include') return true;
  if (generativeAi === 'exclude') return false;
  return undefined;
}

/**
 * Fetches enough pages to satisfy `wanted` rows, capped so a single search
 * can never hammer Adobe's API. `wanted` is already tier-clamped by the
 * caller; we additionally cap the number of upstream calls.
 */
async function fetchAssets(
  baseParams: AdobeSearchParams,
  wanted: number,
): Promise<{ files: AdobeFile[]; nbResults: number | null }> {
  if (wanted <= 0) return { files: [], nbResults: null };

  const files: AdobeFile[] = [];
  let nbResults: number | null = null;
  const maxPages = Math.min(10, Math.max(1, Math.ceil(wanted / PAGE_SIZE)));

  for (let page = 0; page < maxPages; page++) {
    const res = await searchAdobeStock({
      ...baseParams,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (typeof res.nb_results === 'number') nbResults = res.nb_results;
    const batch = res.files || [];
    files.push(...batch);
    if (batch.length < PAGE_SIZE) break; // last page
    if (files.length >= wanted) break;
  }

  return { files, nbResults };
}

export interface KeywordSearchInput {
  userId: string;
  query: string;
  sort: SortValue;
  contentType: ContentTypeValue;
  generativeAi: GenerativeAiValue;
}

export async function searchByKeyword(input: KeywordSearchInput): Promise<KeywordSearchResult> {
  const gate = await getAnalyticsGate(input.userId);

  if (!isAdobeConfigured()) {
    return emptyKeywordResult(
      input,
      gate,
      'The Adobe Stock API is not configured on this deployment. An admin must set ADOBE_STOCK_API_KEY.',
    );
  }

  let files: AdobeFile[] = [];
  let nbResults: number | null = null;
  let warning: string | undefined;
  let recencySample: AssetRow[] = [];

  // Pull one page, learn the exact total from `nb_results`, then fetch only as
  // many extra pages as the tier cap actually allows. Free-tier users are cut
  // off at their limit before any further upstream traffic is generated.
  const baseParams = {
    words: input.query,
    filters: {
      ...contentTypeFilters(input.contentType),
      gentech: gentechFilter(input.generativeAi),
    },
  };
  try {
    const first = await searchAdobeStock({
      ...baseParams,
      order: mapOrder(input.sort),
      limit: PAGE_SIZE,
      offset: 0,
    });
    nbResults = typeof first.nb_results === 'number' ? first.nb_results : null;
    files = first.files || [];

    const total = nbResults ?? files.length;
    const allowed = isUnlimited(gate.limit) ? UNLIMITED_FETCH_CEILING : gate.limit;
    if (files.length < Math.min(total, allowed)) {
      const more = await fetchAssets({ ...baseParams, order: mapOrder(input.sort) }, allowed);
      files = more.files;
      if (typeof more.nbResults === 'number') nbResults = more.nbResults;
    }

    // Adobe exposes no publish dates, so the recency chart needs results in
    // creation order. This is a SEPARATE sample: the grid must keep the sort
    // order the user actually chose.
    if (input.sort !== 'newest' && files.length >= 4) {
      try {
        const recency = await searchAdobeStock({
          ...baseParams,
          order: 'creation',
          limit: RECENCY_SAMPLE_SIZE,
          offset: 0,
        });
        recencySample = (recency.files || []).map(toAssetRow);
      } catch {
        // Recency data is a nice-to-have; keep the primary ordering.
      }
    }
  } catch (e) {
    warning = eMessage(e);
  }

  const total = nbResults ?? files.length;
  const { visible, hidden } = applyRowGate(total, gate.limit);
  const assets = files.slice(0, visible).map(toAssetRow);
  // Chart the creation-ordered sample when we have one; otherwise the grid
  // rows are the best available proxy for recency.
  const { points, basis } = estimateInterestTrend(
    recencySample.length >= 4 ? recencySample : assets,
    total,
  );

  return {
    query: input.query,
    sort: input.sort,
    contentType: input.contentType,
    generativeAi: input.generativeAi,
    totalResults: total,
    totalIsExact: typeof nbResults === 'number',
    assets,
    hiddenCount: hidden,
    limit: gate.limit,
    tier: gate.tier,
    planName: gate.planName,
    trend: points,
    trendSource: 'estimated',
    trendBasis: basis,
    // Adobe exposes no readable download counts, so this is always false.
    downloadsAvailable: false,
    ...(warning ? { warning } : {}),
  };
}

function emptyKeywordResult(
  input: KeywordSearchInput,
  gate: { tier: string; limit: number; planName: string },
  warning: string,
): KeywordSearchResult {
  return {
    query: input.query,
    sort: input.sort,
    contentType: input.contentType,
    generativeAi: input.generativeAi,
    totalResults: null,
    totalIsExact: false,
    assets: [],
    hiddenCount: 0,
    limit: gate.limit,
    tier: gate.tier,
    planName: gate.planName,
    trend: [],
    trendSource: 'estimated',
    trendBasis: 'No Adobe data available to model a trend.',
    downloadsAvailable: false,
    warning,
  };
}

export interface ContributorSearchInput {
  userId: string;
  contributorId: number;
}

export async function searchByContributor(
  input: ContributorSearchInput,
): Promise<ContributorResult> {
  const gate = await getAnalyticsGate(input.userId);

  let files: AdobeFile[] = [];
  let nbResults: number | null = null;
  let warning: string | undefined;

  if (!isAdobeConfigured()) {
    warning =
      'The Adobe Stock API is not configured on this deployment. An admin must set ADOBE_STOCK_API_KEY.';
  } else {
    const wanted = isUnlimited(gate.limit) ? 500 : Math.min(gate.limit, PAGE_SIZE * 3);
    try {
      // Adobe has no contributor-lookup endpoint; the documented way to get
      // a contributor's public portfolio is to search with creator_id.
      const res = await fetchAssets({ creatorId: input.contributorId, order: 'creation' }, wanted);
      files = res.files;
      nbResults = res.nbResults;
    } catch (e) {
      warning = eMessage(e);
    }
  }

  const total = nbResults ?? null;
  const { visible, hidden } = applyRowGate(total ?? files.length, gate.limit);
  const assets = files.slice(0, visible).map(toAssetRow);

  const byType = new Map<string, number>();
  let totalKeywords = 0;
  for (const a of assets) {
    byType.set(a.contentType, (byType.get(a.contentType) || 0) + 1);
    totalKeywords += a.keywords.length;
  }

  return {
    contributorId: input.contributorId,
    contributorName: assets.find((a) => a.contributorName)?.contributorName || null,
    totalAssets: total,
    totalIsExact: typeof nbResults === 'number',
    assets,
    hiddenCount: hidden,
    limit: gate.limit,
    tier: gate.tier,
    planName: gate.planName,
    aggregate: {
      byContentType: [...byType.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      totalKeywords,
    },
    ...(warning ? { warning } : {}),
  };
}

function eMessage(e: unknown): string {
  if (e instanceof AdobeStockError) return e.message;
  if (isConfigurationError(e)) return 'The Adobe Stock API is not configured on this deployment.';
  return e instanceof Error ? e.message : 'Search failed';
}

/** Persists a query for the user's history, never storing asset payloads. */
export async function recordQuery(
  userId: string,
  queryType: 'keyword' | 'contributor_id',
  queryValue: string,
  resultData: unknown,
): Promise<void> {
  try {
    await prisma.adobeAnalyticsQuery.create({
      data: { userId, queryType, queryValue, resultData: resultData as any },
    });
  } catch {
    // History is best-effort; never fail a search because logging failed.
  }
}
