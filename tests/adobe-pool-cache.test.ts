import { describe, it, expect } from 'vitest';
import {
  POOL_CACHE_TTL_MS,
  isPoolCacheUsable,
  poolCacheCoversRequest,
  type PoolFetchDims,
} from '@/lib/adobe-analytics/pool-cache';

const NOW = new Date('2026-10-29T12:00:00.000Z');

function row(poolCount: number, expiresAt: Date) {
  return { poolCount, expiresAt };
}

describe('isPoolCacheUsable (R9 H1/H2)', () => {
  it('serves a fresh pool that is deeper than the request', () => {
    const fresh = new Date(NOW.getTime() + 60_000);
    expect(isPoolCacheUsable(row(500, fresh), 100, NOW)).toBe(true);
  });

  it('serves a fresh pool exactly as deep as the request', () => {
    const fresh = new Date(NOW.getTime() + 60_000);
    expect(isPoolCacheUsable(row(100, fresh), 100, NOW)).toBe(true);
  });

  it('rejects a stale pool even when it is deep enough', () => {
    const stale = new Date(NOW.getTime() - 1);
    expect(isPoolCacheUsable(row(1000, stale), 100, NOW)).toBe(false);
  });

  it('rejects a pool expiring exactly now (freshness is strict)', () => {
    expect(isPoolCacheUsable(row(1000, NOW), 100, NOW)).toBe(false);
  });

  it('rejects a fresh pool that is shallower than the request', () => {
    const fresh = new Date(NOW.getTime() + 60_000);
    expect(isPoolCacheUsable(row(50, fresh), 100, NOW)).toBe(false);
  });

  it('rejects a missing row', () => {
    expect(isPoolCacheUsable(null, 100, NOW)).toBe(false);
    expect(isPoolCacheUsable(undefined, 100, NOW)).toBe(false);
  });

  it('keeps pools servable for 6 hours', () => {
    expect(POOL_CACHE_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('poolCacheCoversRequest', () => {
  const dims = (over: Partial<PoolFetchDims>): PoolFetchDims => ({
    contentType: 'all',
    generativeAi: 'all',
    sort: 'relevance',
    ...over,
  });

  it('an unfiltered pool covers any later filter combination', () => {
    expect(
      poolCacheCoversRequest(
        dims({}),
        dims({ contentType: 'vector', generativeAi: 'exclude', sort: 'downloads' }),
      ),
    ).toBe(true);
  });

  it('a filtered pool covers the same filter but not a different one', () => {
    const stored = dims({ contentType: 'photo' });
    expect(poolCacheCoversRequest(stored, dims({ contentType: 'photo' }))).toBe(true);
    expect(poolCacheCoversRequest(stored, dims({ contentType: 'vector' }))).toBe(false);
    expect(poolCacheCoversRequest(stored, dims({ contentType: 'all' }))).toBe(false);
  });

  it('a generative-AI-filtered pool does not cover other AI filters', () => {
    const stored = dims({ generativeAi: 'include' });
    expect(poolCacheCoversRequest(stored, dims({ generativeAi: 'include' }))).toBe(true);
    expect(poolCacheCoversRequest(stored, dims({ generativeAi: 'exclude' }))).toBe(false);
  });

  it('relevance requests need a relevance-fetched pool; other sorts re-sort locally', () => {
    const stored = dims({ sort: 'downloads' });
    expect(poolCacheCoversRequest(stored, dims({ sort: 'relevance' }))).toBe(false);
    expect(poolCacheCoversRequest(stored, dims({ sort: 'newest' }))).toBe(true);
    expect(poolCacheCoversRequest(stored, dims({ sort: 'downloads' }))).toBe(true);
  });
});
