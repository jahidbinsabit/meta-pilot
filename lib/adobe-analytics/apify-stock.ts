/**
 * Apify Adobe Stock Scraper Integration.
 * Runs Actor `Ea82wcTpNYzTRV7A3` (Adobe Stock Scraper)
 * to retrieve real Adobe Stock assets, creator portfolios, exact download counts,
 * views, tags, dimensions, and creation dates.
 */

import { ApifyClient } from 'apify-client';
import { prisma } from '@/lib/db';
import { getAdobeCdnUrls } from './adobe-stock';
import {
  formatPublishedAgo,
  type AssetRow,
  type ContentTypeValue,
  type GenerativeAiValue,
  type SortValue,
} from './types';

const DEFAULT_ACTOR_ID = 'NkJXb8hz0J4IIueVA';

export interface ApifyStockConfig {
  token: string;
  actorId: string;
}

/**
 * Resolves the Apify API token and Actor ID from SiteSettings or environment.
 */
export async function getApifyConfig(): Promise<ApifyStockConfig | null> {
  let token = process.env.APIFY_API_TOKEN || '';
  let actorId = process.env.APIFY_ACTOR_ID || DEFAULT_ACTOR_ID;

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'default' },
      select: { apifyApiToken: true, apifyActorId: true },
    });

    if (settings?.apifyApiToken?.trim()) {
      token = settings.apifyApiToken.trim();
    }
    if (settings?.apifyActorId?.trim()) {
      const storedActor = settings.apifyActorId.trim();
      actorId = storedActor === 'KPyKQZuofuTIxI4yZ' ? DEFAULT_ACTOR_ID : storedActor;
    }
  } catch {
    // Database fallback to env
  }

  if (!token) return null;
  return { token, actorId };
}

/**
 * Builds standard Adobe Stock search URL for scrapers that expect startUrls.
 */
export function buildAdobeSearchUrl(params: {
  query?: string;
  creatorId?: number;
  contentType?: ContentTypeValue;
  generativeAi?: GenerativeAiValue;
  sort?: SortValue;
}): string {
  const url = new URL('https://stock.adobe.com/search');
  if (params.query?.trim()) {
    url.searchParams.set('k', params.query.trim());
  }
  if (params.creatorId) {
    url.searchParams.set('creator_id', String(params.creatorId));
  }
  if (params.contentType === 'photo') {
    url.searchParams.set('filters[content_type:photo]', '1');
  } else if (params.contentType === 'vector') {
    url.searchParams.set('filters[content_type:vector]', '1');
  } else if (params.contentType === 'illustration') {
    url.searchParams.set('filters[content_type:illustration]', '1');
  }

  if (params.generativeAi === 'include') {
    url.searchParams.set('filters[gentech]', '1');
  } else if (params.generativeAi === 'exclude') {
    url.searchParams.set('filters[gentech]', '0');
  }

  if (params.sort === 'newest') {
    url.searchParams.set('order', 'creation');
  } else if (params.sort === 'downloads') {
    url.searchParams.set('order', 'nb_downloads');
  } else {
    url.searchParams.set('order', 'relevance');
  }

  return url.toString();
}

/**
 * Maps input search parameters into universal Apify Actor inputs.
 */
export function mapToApifyInput(params: {
  query?: string;
  creatorId?: number;
  contentType?: ContentTypeValue;
  generativeAi?: GenerativeAiValue;
  sort?: SortValue;
  maxItems?: number;
}) {
  const maxItems = Math.min(100, Math.max(1, params.maxItems ?? 50));
  const targetUrl = buildAdobeSearchUrl(params);

  let ai: '' | 'only' | 'exclude' = '';
  let aiFilter: 'all' | 'only' | 'exclude' = 'all';
  if (params.generativeAi === 'include') {
    ai = 'only';
    aiFilter = 'only';
  } else if (params.generativeAi === 'exclude') {
    ai = 'exclude';
    aiFilter = 'exclude';
  }

  let order: 'relevance' | 'downloads' | 'newest' = 'relevance';
  if (params.sort === 'newest') order = 'newest';
  else if (params.sort === 'downloads') order = 'downloads';

  const q = params.query?.trim() || '';

  const input: Record<string, any> = {
    query: q,
    search: q,
    keyword: q,
    maxItems,
    region: 'us',
    order,
    ai,
    aiFilter,
    startUrls: [{ url: targetUrl }],
    searchUrls: [targetUrl],
  };

  // Only pass 'asset' if contentType matches the actor's allowed enum
  const validAssets = ['photo', 'illustration', 'vector', '3d', 'template', 'video'];
  if (params.contentType && validAssets.includes(params.contentType)) {
    input.asset = params.contentType;
    input.assetType = params.contentType;
  } else {
    input.assetType = 'all';
  }

  if (params.creatorId) {
    input.creatorId = params.creatorId;
    input.creator_id = params.creatorId;
  }

  return input;
}

/**
 * Extracts and normalizes string tags/keywords from raw dataset objects.
 */
function extractKeywords(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const list: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) list.push(trimmed);
      } else if (item && typeof item === 'object') {
        const val = item.name || item.keyword || item.tag || item.title || item.value;
        if (typeof val === 'string' && val.trim()) list.push(val.trim());
      }
    }
    return Array.from(new Set(list));
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parses numbers from numeric or formatted strings (e.g. "1.2k", "450").
 */
function parseNumeric(val: any): number | null {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim().toLowerCase();
    if (cleaned.endsWith('k')) {
      const num = parseFloat(cleaned.slice(0, -1));
      return isNaN(num) ? null : Math.round(num * 1000);
    }
    if (cleaned.endsWith('m')) {
      const num = parseFloat(cleaned.slice(0, -1));
      return isNaN(num) ? null : Math.round(num * 1000000);
    }
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extracts thumbnail and high-res image URLs.
 */
function extractThumbnails(item: any): { thumb: string | null; thumb500: string | null } {
  const candidates = [
    item.thumbnail_1000_url,
    item.thumbnail1000Url,
    item.thumbnail_500_url,
    item.thumbnail500Url,
    item.thumbnail_url,
    item.thumbnailUrl,
    item.thumbnail,
    item.image,
    item.imageUrl,
    item.image_url,
    item.preview_url,
    item.previewUrl,
    item.display_url,
    item.displayUrl,
    item.url_thumbnail,
    item.src,
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

  const thumb500 = candidates[0] || null;
  const thumb = candidates.find((u) => u.includes('220') || u.includes('240') || u.includes('160')) || candidates[candidates.length - 1] || thumb500;

  return { thumb, thumb500 };
}

/**
 * Runs the Apify Actor and transforms raw dataset items into typed AssetRow objects.
 */
export async function runApifyAdobeStockScraper(params: {
  query?: string;
  creatorId?: number;
  contentType?: ContentTypeValue;
  generativeAi?: GenerativeAiValue;
  sort?: SortValue;
  maxItems?: number;
}): Promise<{ assets: AssetRow[]; totalResults: number }> {
  const config = await getApifyConfig();
  if (!config) {
    throw new Error('Apify API token is not configured. Please set your Apify API Token in Admin Settings (/admin/settings).');
  }

  const client = new ApifyClient({
    token: config.token,
  });

  const input = mapToApifyInput(params);

  // Call the actor and wait for execution to complete (with 120s timeout)
  const run = await client.actor(config.actorId).call(input, {
    timeout: 120,
    waitSecs: 120,
  });

  if (!run || !run.defaultDatasetId) {
    throw new Error('Apify run finished without a dataset. Please verify the Actor ID and API Token.');
  }

  // Fetch results from the dataset
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // Flatten items if dataset contains nested lists
  const rawItems = items || [];
  const flattened: any[] = [];
  for (const item of rawItems) {
    if (Array.isArray(item.results)) {
      flattened.push(...item.results);
    } else if (Array.isArray(item.items)) {
      flattened.push(...item.items);
    } else if (Array.isArray(item.data)) {
      flattened.push(...item.data);
    } else {
      flattened.push(item);
    }
  }

  const assets: AssetRow[] = flattened.map((item: any, index: number): AssetRow => {
    const rawKeywords = item.keywordList || item.keywords || item.tags || item.keyword_list || item.tag_list || item.categories || item.categoryInfo?.name;
    const keywords = extractKeywords(rawKeywords);

    const creationDate =
      item.creation_date ||
      item.created_date ||
      item.creationDate ||
      item.createdDate ||
      item.createdAt ||
      item.date ||
      item.published_date ||
      item.publishedDate ||
      item.publish_date ||
      null;

    const publishedAgo = formatPublishedAgo(creationDate);

    const downloads = parseNumeric(
      item.downloadCount ??
        item.download_count ??
        item.downloads ??
        item.downloadsCount ??
        item.nb_downloads ??
        item.download_counter,
    );

    const views = parseNumeric(
      item.viewCount ??
        item.view_count ??
        item.views ??
        item.viewsCount ??
        item.nb_views,
    );

    const width = parseNumeric(item.pixelWidth ?? item.width ?? item.original_width ?? item.dimensions?.width);
    const height = parseNumeric(item.pixelHeight ?? item.height ?? item.original_height ?? item.dimensions?.height);

    const rawStockId =
      item.assetId ||
      item.asset_id ||
      item.id ||
      item.stock_id ||
      item.stockId ||
      item.itemId ||
      item.media_id ||
      item.mediaId ||
      (typeof item.detailsUrl === 'string' ? item.detailsUrl.match(/\/(\d{7,12})/)?.[1] : null) ||
      (typeof item.url === 'string' ? item.url.match(/(\d{7,12})/)?.[1] : null);

    const stockId = parseNumeric(rawStockId) || index + 1000;

    const rawCreatorId =
      item.creatorId ||
      item.creator_id ||
      item.authorId ||
      item.author_id ||
      item.contributorId ||
      item.contributor_id ||
      item.userId ||
      item.user_id;

    const creatorId = parseNumeric(rawCreatorId);

    const creatorName =
      item.creatorName ||
      item.creator_name ||
      item.author ||
      item.author_name ||
      item.authorName ||
      item.contributor ||
      item.contributor_name ||
      item.artist ||
      item.artist_name ||
      item.photographer ||
      (creatorId ? `Contributor #${creatorId}` : 'Adobe Stock Contributor');

    const { thumb, thumb500 } = extractThumbnails(item);
    const cdn = stockId > 1000 ? getAdobeCdnUrls(stockId) : null;
    const finalThumb500 = thumb500 || cdn?.thumb500 || thumb;
    const finalThumb = thumb || cdn?.thumb240 || finalThumb500;

    const title =
      item.assetTitle ||
      item.asset_title ||
      item.title ||
      item.name ||
      item.caption ||
      item.headline ||
      (params.query ? `Adobe Stock - ${params.query}` : 'Adobe Stock Asset');

    const rawType = (
      item.contentType ||
      item.content_type ||
      item.asset ||
      item.assetType ||
      item.media_type ||
      item.mediaType ||
      item.type ||
      ''
    ).toLowerCase();

    let contentType: 'photo' | 'vector' | 'illustration' | 'video' | 'template' | '3d' = 'photo';
    if (rawType.includes('vector') || rawType.includes('illustrator') || item.is_vector) contentType = 'vector';
    else if (rawType.includes('illustration')) contentType = 'illustration';
    else if (rawType.includes('video')) contentType = 'video';
    else if (rawType.includes('template')) contentType = 'template';
    else if (rawType.includes('3d')) contentType = '3d';

    const isGenerativeAi = Boolean(
      item.isGenerativeAi ||
        item.is_gentech ||
        item.is_ai ||
        item.isAi ||
        item.isGenAi ||
        item.generativeAi ||
        item.ai_generated ||
        item.aiGenerated ||
        keywords.some((k) =>
          /generative ai|ai generated|midjourney|dall-e|firefly/i.test(k),
        ),
    );

    const detailsUrl =
      item.detailsUrl ||
      item.details_url ||
      item.url ||
      item.itemUrl ||
      item.stock_url ||
      item.stockUrl ||
      `https://stock.adobe.com/images/${stockId}`;

    return {
      id: stockId,
      title,
      contentType,
      thumbnailUrl: finalThumb,
      thumbnail500Url: finalThumb500,
      detailsUrl,
      contributorId: creatorId,
      contributorName: creatorName,
      countryName: item.country_name || item.countryName || item.country || null,
      width,
      height,
      keywords,
      isGenerativeAi,
      creationDate,
      publishedAgo,
      downloads,
      views,
    };
  });

  return {
    assets,
    totalResults: assets.length,
  };
}

export async function isApifyConfigured(): Promise<boolean> {
  const config = await getApifyConfig();
  return Boolean(config && config.token);
}
