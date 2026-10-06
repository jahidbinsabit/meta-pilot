import { prisma } from '@/lib/db';
import {
  searchAdobeStock,
  isAdobeConfigured,
  isConfigurationError,
  mapOrder,
  getAdobeCdnUrls,
  AdobeStockError,
  type AdobeFile,
  type AdobeSearchParams,
} from './adobe-stock';
import {
  runApifyAdobeStockScraper,
  isApifyConfigured,
} from './apify-stock';
import { estimateInterestTrend } from './trend';
import { applyRowGate, getAnalyticsGate, isUnlimited } from './tiers';
import {
  formatPublishedAgo,
  type AssetRow,
  type ContentTypeValue,
  type ContributorResult,
  type GenerativeAiValue,
  type KeywordSearchResult,
  type SortValue,
} from './types';

/** One page request to Adobe. */
const PAGE_SIZE = 100;

/**
 * Ceiling for unlimited tiers.
 */
const UNLIMITED_FETCH_CEILING = 500;

/**
 * How many creation-ordered assets to pull for the recency chart.
 */
const RECENCY_SAMPLE_SIZE = 50;

function toAssetRow(f: AdobeFile): AssetRow {
  const creationDate = f.created_date || null;
  const publishedAgo = formatPublishedAgo(creationDate);
  const cdn = typeof f.id === 'number' && f.id > 1000 ? getAdobeCdnUrls(f.id) : null;
  const rawThumb = f.thumbnail_url || cdn?.thumb500 || cdn?.thumb240 || null;
  const thumb500 = cdn?.thumb500 || (rawThumb
    ? rawThumb.replace('/240_F_', '/500_F_').replace('/220_F_', '/500_F_').replace('/160_F_', '/500_F_')
    : null);

  return {
    id: f.id,
    title: f.title || 'Untitled',
    contentType: f.content_type || 'unknown',
    thumbnailUrl: rawThumb,
    thumbnail500Url: thumb500 || rawThumb,
    detailsUrl: `https://stock.adobe.com/images/${f.id}`,
    contributorId: typeof f.creator_id === 'number' ? f.creator_id : null,
    contributorName: f.creator_name || null,
    width: typeof f.width === 'number' ? f.width : null,
    height: typeof f.height === 'number' ? f.height : null,
    keywords: Array.isArray(f.keywords) ? f.keywords : [],
    isGenerativeAi: f.is_gentech === true,
    creationDate,
    publishedAgo,
    downloads: null,
    views: null,
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

  // 1. Try Apify Adobe Stock Scraper Engine if configured
  if (await isApifyConfigured()) {
    try {
      const allowed = isUnlimited(gate.limit) ? 100 : Math.min(gate.limit, 100);
      const res = await runApifyAdobeStockScraper({
        query: input.query,
        contentType: input.contentType,
        generativeAi: input.generativeAi,
        sort: input.sort,
        maxItems: allowed,
      });

      const total = res.totalResults;
      const { visible, hidden } = applyRowGate(total, gate.limit);
      const assets = res.assets.slice(0, visible);

      const { points, basis } = estimateInterestTrend(assets, total);

      return {
        query: input.query,
        sort: input.sort,
        contentType: input.contentType,
        generativeAi: input.generativeAi,
        totalResults: total,
        totalIsExact: true,
        assets,
        hiddenCount: hidden,
        limit: gate.limit,
        tier: gate.tier,
        planName: gate.planName,
        trend: points,
        trendSource: 'adobe',
        trendBasis: basis || 'Scraped from live Adobe Stock dataset via Apify Scraper Engine',
        downloadsAvailable: true,
      };
    } catch (err: any) {
      console.error('[adobe-analytics] Apify scraper execution failed:', err.message);
      if (!isAdobeConfigured()) {
        return emptyKeywordResult(
          input,
          gate,
          `Apify Stock Scraper Error: ${err.message || 'Scraper run failed'}. Please check your Apify API Token & Actor ID in Admin Settings.`,
        );
      }
    }
  }

  // 2. Official Adobe Stock API if API key is provided
  if (!isAdobeConfigured()) {
    return emptyKeywordResult(
      input,
      gate,
      'The Stock Scraper Engine is not configured yet. Please configure your Apify API Token in Admin Settings (/admin/settings) to fetch live Adobe Stock analytics.',
    );
  }

  let files: AdobeFile[] = [];
  let nbResults: number | null = null;
  let warning: string | undefined;
  let recencySample: AssetRow[] = [];

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
        // Recency sample fallback
      }
    }
  } catch (e) {
    warning = eMessage(e);
  }

  const total = nbResults ?? files.length;
  const { visible, hidden } = applyRowGate(total, gate.limit);
  const assets = files.slice(0, visible).map(toAssetRow);
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

  // 1. Try Apify Adobe Stock Scraper Engine if configured
  if (await isApifyConfigured()) {
    try {
      const allowed = isUnlimited(gate.limit) ? 100 : Math.min(gate.limit, 100);
      const res = await runApifyAdobeStockScraper({
        creatorId: input.contributorId,
        maxItems: allowed,
      });

      const total = res.totalResults;
      const { visible, hidden } = applyRowGate(total, gate.limit);
      const assets = res.assets.slice(0, visible);

      const byType = new Map<string, number>();
      let totalKeywords = 0;
      for (const a of assets) {
        byType.set(a.contentType, (byType.get(a.contentType) || 0) + 1);
        totalKeywords += a.keywords.length;
      }

      return {
        contributorId: input.contributorId,
        contributorName: assets.find((a) => a.contributorName)?.contributorName || `Contributor #${input.contributorId}`,
        totalAssets: total,
        totalIsExact: true,
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
      };
    } catch (err: any) {
      console.error('[adobe-analytics] Apify contributor scraper failed:', err.message);
      if (!isAdobeConfigured()) {
        return {
          contributorId: input.contributorId,
          contributorName: `Contributor #${input.contributorId}`,
          totalAssets: null,
          totalIsExact: false,
          assets: [],
          hiddenCount: 0,
          limit: gate.limit,
          tier: gate.tier,
          planName: gate.planName,
          aggregate: { byContentType: [], totalKeywords: 0 },
          warning: `Apify Scraper Error: ${err.message || 'Lookup failed'}. Please check your Apify API Token in Admin Settings.`,
        };
      }
    }
  }

  // 2. Official Adobe Stock API if API key is provided
  let files: AdobeFile[] = [];
  let nbResults: number | null = null;
  let warning: string | undefined;

  if (!isAdobeConfigured()) {
    warning =
      'The Stock Scraper Engine is not configured yet. Please configure your Apify API Token in Admin Settings (/admin/settings) to fetch live contributor portfolios.';
  } else {
    const wanted = isUnlimited(gate.limit) ? 500 : Math.min(gate.limit, PAGE_SIZE * 3);
    try {
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
