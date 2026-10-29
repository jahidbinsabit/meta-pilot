import { prisma } from '@/lib/db';
import type {
  AssetRow,
  ContentTypeValue,
  GenerativeAiValue,
  SortValue,
} from './types';

/**
 * Adobe contributor pool cache (R9 H1/H2).
 *
 * Progressive contributor browsing used to re-run the paid Apify actor
 * at every cumulative ladder depth (25 → 50 → … → 1000), billing the
 * full `maxItems` of every step (~10.5× the rows actually displayed),
 * and every repeat search — same contributor, any user — paid again.
 * This module stores the deepest normalized pool fetched per
 * contributor for a few hours; shallower or repeat requests are then
 * served by slicing the stored pool, with NO actor run.
 *
 * The pool is stored UNSLICED and UNGATED: it holds the contributor-
 * verified rows exactly as a fresh actor run produced them, before
 * local filters/sort and before the tier gate. Callers apply all of
 * that after the read, exactly as they do for a fresh run, so one
 * cached pool serves every tier.
 *
 * The actor DOES apply the request's content-type / generative-AI /
 * sort dimensions upstream (they are baked into the Adobe search URL
 * it scrapes), so a pool is only reusable for requests its fetch
 * dimensions cover — see poolCacheCoversRequest(). The dimensions ride
 * along inside the `pool` Json envelope next to the rows.
 *
 * Every accessor is best-effort: a cache read/write failure must never
 * break a search, so errors are swallowed and callers fall through to
 * a normal actor run.
 */

/** How long a fetched contributor pool stays servable. */
export const POOL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** The request dimensions a pool was fetched with. */
export interface PoolFetchDims {
  contentType: ContentTypeValue;
  generativeAi: GenerativeAiValue;
  sort: SortValue;
}

interface StoredPoolEnvelope {
  v: 1;
  dims: PoolFetchDims;
  assets: AssetRow[];
}

/**
 * Pure usability rule for a cache row: it must exist, still be fresh
 * (strictly unexpired), and hold at least the depth the caller is
 * about to fetch. Fresh-but-shallower is NOT usable — serving it would
 * silently cap a deeper request at the old depth.
 */
export function isPoolCacheUsable(
  row: { poolCount: number; expiresAt: Date } | null | undefined,
  want: number,
  now: Date,
): boolean {
  if (!row) return false;
  if (!(row.expiresAt.getTime() > now.getTime())) return false;
  return row.poolCount >= want;
}

/**
 * Whether a pool fetched with `stored` dimensions can serve a request
 * with `requested` dimensions, given the actor applies them upstream:
 *
 * - A pool fetched unfiltered ('all') covers any later filter; a pool
 *   fetched WITH a filter covers only that same filter (its rows were
 *   never fetched for the others).
 * - 'newest'/'downloads' requests re-sort locally from any pool, so
 *   they are always covered; 'relevance' keeps the source order, so
 *   it is only covered by a pool that was itself fetched in relevance
 *   order.
 */
export function poolCacheCoversRequest(
  stored: PoolFetchDims,
  requested: PoolFetchDims,
): boolean {
  if (stored.contentType !== 'all' && stored.contentType !== requested.contentType) {
    return false;
  }
  if (stored.generativeAi !== 'all' && stored.generativeAi !== requested.generativeAi) {
    return false;
  }
  if (requested.sort === 'relevance' && stored.sort !== 'relevance') {
    return false;
  }
  return true;
}

/**
 * Returns the stored pool for a contributor when it can serve a fetch
 * of depth `want` with dimensions `dims` — otherwise null (caller runs
 * the actor). Never throws.
 */
export async function readUsablePoolCache(
  contributorId: number,
  want: number,
  dims: PoolFetchDims,
): Promise<AssetRow[] | null> {
  try {
    const row = await prisma.adobePoolCache.findUnique({
      where: { contributorId: String(contributorId) },
    });
    if (!isPoolCacheUsable(row, want, new Date())) return null;
    const envelope = row!.pool as unknown as StoredPoolEnvelope | null;
    if (
      !envelope ||
      !Array.isArray(envelope.assets) ||
      !envelope.dims ||
      !poolCacheCoversRequest(envelope.dims, dims)
    ) {
      return null;
    }
    return envelope.assets;
  } catch {
    return null;
  }
}

/** Boolean form of readUsablePoolCache (route-side budget checks). */
export async function hasUsablePoolCache(
  contributorId: number,
  want: number,
  dims: PoolFetchDims,
): Promise<boolean> {
  return (await readUsablePoolCache(contributorId, want, dims)) !== null;
}

/**
 * Stores the pool a fresh actor run produced (contributor-verified,
 * before local filters and the tier gate), replacing any older row.
 * Never throws.
 */
export async function writePoolCache(
  contributorId: number,
  assets: AssetRow[],
  dims: PoolFetchDims,
): Promise<void> {
  try {
    const now = new Date();
    const envelope: StoredPoolEnvelope = { v: 1, dims, assets };
    const expiresAt = new Date(now.getTime() + POOL_CACHE_TTL_MS);
    await prisma.adobePoolCache.upsert({
      where: { contributorId: String(contributorId) },
      create: {
        contributorId: String(contributorId),
        pool: envelope as any,
        poolCount: assets.length,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        pool: envelope as any,
        poolCount: assets.length,
        fetchedAt: now,
        expiresAt,
      },
    });
  } catch {
    // Cache is best-effort; never fail a search because storing failed.
  }
}
