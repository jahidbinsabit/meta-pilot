/**
 * Server-side client for the official Adobe Stock Search API.
 *
 * Contract verified against Adobe's published "Stock API reference"
 * (https://developer.adobe.com/stock/docs/api/):
 *
 *   GET https://stock.adobe.io/Rest/Media/1/Search/Files
 *   Required headers: x-api-key, X-Product
 *   Optional headers: Authorization (Bearer, only needed for licensing state)
 *
 *   Total matches: top-level `nb_results` (exact, Adobe-reported).
 *   Max page size: 100 (`search_parameters[limit]`), paged via `[offset]`.
 *
 * IMPORTANT ACCURACY NOTE
 * -----------------------
 * Adobe does NOT expose a per-asset download count. `nb_downloads` is a valid
 * value for `search_parameters[order]` (sort by popularity) but it is NOT a
 * readable `result_columns[]` field. Every code path here therefore leaves
 * `downloads` as `null`; the UI renders "Not available" rather than
 * inventing a number. Search volume over time is likewise not exposed, so
 * the trend series is a documented estimate and is labeled as such.
 *
 * Anonymous search (no Authorization header) is intentional: it is enough
 * for asset metadata and previews, and avoids requiring a per-user IMS
 * token for a public-content feature.
 */

const BASE_URL = 'https://stock.adobe.io';
const SEARCH_PATH = '/Rest/Media/1/Search/Files';
const MAX_LIMIT = 100;

/**
 * The only columns this module renders. Verified against Adobe's published
 * 67-column list: `nb_downloads` and any date field are absent, which is why
 * no download count or publish date is ever read.
 */
const RESULT_COLUMNS = [
  'id',
  'title',
  'width',
  'height',
  'creator_name',
  'creator_id',
  'thumbnail_url',
  'media_type_id',
  'content_type',
  'vector_type',
  'category',
  'keywords',
  'is_gentech',
  'is_premium',
  'premium_level_id',
] as const;

export const DEFAULT_TIMEOUT_MS = 12_000;

export interface AdobeFile {
  id: number;
  title?: string;
  width?: number;
  height?: number;
  creator_name?: string;
  creator_id?: number;
  thumbnail_url?: string;
  media_type_id?: number;
  content_type?: string;
  vector_type?: string | null;
  category?: { id?: number; name?: string };
  keywords?: string[];
  is_gentech?: boolean;
  is_premium?: boolean;
  premium_level_id?: number;
  created_date?: string;
}

export interface AdobeSearchResponse {
  nb_results?: number;
  files?: AdobeFile[];
  error_code?: number | string;
  message?: string;
  title?: string;
}

export interface AdobeSearchParams {
  /** Space-separated keywords, or empty when searching by creator only. */
  words?: string;
  /** Numeric Adobe Stock contributor ID. */
  creatorId?: number;
  order?: 'relevance' | 'creation' | 'featured' | 'nb_downloads' | 'undiscovered';
  /** 1-100. */
  limit?: number;
  offset?: number;
  /** 110 | 160 | 220 | 240 | 500 | 1000. Default 220. */
  thumbnailSize?: number;
  filters?: {
    contentTypePhoto?: boolean;
    contentTypeVector?: boolean;
    contentTypeIllustration?: boolean;
    /** true = only GenAI, false = only non-GenAI, undefined = both. */
    gentech?: boolean;
  };
  locale?: string;
}

/** Content type filter values -> the `search_parameters[filters]` keys. */
function buildFilters(params: AdobeSearchParams): Record<string, string> {
  const f: Record<string, string> = {};
  // Strongly recommended by Adobe to keep pagination exact.
  f['search_parameters[filters][premium]'] = 'all';

  const t = params.filters;
  if (t?.contentTypePhoto) f['search_parameters[filters][content_type:photo]'] = '1';
  if (t?.contentTypeVector) f['search_parameters[filters][content_type:vector]'] = '1';
  if (t?.contentTypeIllustration) f['search_parameters[filters][content_type:illustration]'] = '1';
  if (typeof t?.gentech === 'boolean') f['search_parameters[filters][gentech]'] = String(t.gentech);
  return f;
}

function getApiKey(): string | null {
  const key = process.env.ADOBE_STOCK_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function isAdobeConfigured(): boolean {
  return getApiKey() !== null;
}

/** Maps our `sort` dropdown onto Adobe's documented `order` values. */
export function mapOrder(sort: 'relevance' | 'newest' | 'downloads'): AdobeSearchParams['order'] {
  switch (sort) {
    case 'newest':
      return 'creation';
    case 'downloads':
      // Sorted by all-time downloads across all users — the closest thing
      // Adobe offers to a popularity signal, though the count stays hidden.
      return 'nb_downloads';
    case 'relevance':
    default:
      return 'relevance';
  }
}

export class AdobeStockError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number | string,
  ) {
    super(message);
    this.name = 'AdobeStockError';
  }
}

/** True when a failure means "the server is not configured", not a user error. */
export function isConfigurationError(e: unknown): boolean {
  return e instanceof AdobeStockError && e.message === 'not_configured';
}

export async function searchAdobeStock(
  params: AdobeSearchParams,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AdobeSearchResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AdobeStockError('not_configured');
  }

  const sp = new URLSearchParams();
  sp.set('locale', params.locale || 'en_US');
  sp.set('search_parameters[limit]', String(Math.min(params.limit ?? 32, MAX_LIMIT)));
  sp.set('search_parameters[offset]', String(params.offset ?? 0));
  if (params.order) sp.set('search_parameters[order]', params.order);
  // 220px suits the ~4-up asset grid without over-fetching.
  sp.set('search_parameters[thumbnail_size]', String(params.thumbnailSize ?? 220));

  // Adobe requires at least one search_parameters[] value per request, so a
  // creator-only search must not also send an empty `words`.
  if (params.words) sp.set('search_parameters[words]', params.words);
  if (typeof params.creatorId === 'number' && params.creatorId > 0) {
    sp.set('search_parameters[creator_id]', String(params.creatorId));
  }
  if (!params.words && !params.creatorId) {
    throw new AdobeStockError('A keyword or contributor ID is required');
  }

  for (const [k, v] of Object.entries(buildFilters(params))) sp.set(k, v);

  // Ask for exactly the columns this module renders. Supplying
  // result_columns[] drops Adobe's defaults (which include the bulky
  // thumbnail_html_tag), so this cuts response size substantially.
  for (const col of RESULT_COLUMNS) sp.append('result_columns[]', col);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`${BASE_URL}${SEARCH_PATH}?${sp.toString()}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'X-Product': process.env.ADOBE_STOCK_PRODUCT || 'StockForgeAI/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    let data: AdobeSearchResponse = {};
    try {
      data = text ? (JSON.parse(text) as AdobeSearchResponse) : {};
    } catch {
      // Non-JSON body: fall through to the status-based error below.
    }

    if (!res.ok) {
      throw new AdobeStockError(
        data.message || `Adobe Stock API error (${res.status})`,
        res.status,
        data.error_code,
      );
    }
    return data;
  } catch (e: any) {
    if (e instanceof AdobeStockError) throw e;
    if (e?.name === 'AbortError') {
      throw new AdobeStockError('Adobe Stock request timed out');
    }
    throw new AdobeStockError(e?.message || 'Could not reach the Adobe Stock API');
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
