import { describe, it, expect, vi } from 'vitest';
import { applyRowGate, isUnlimited, FREE_TIER_RESULT_LIMIT } from '@/lib/adobe-analytics/tiers';
import { estimateInterestTrend, trendDirection } from '@/lib/adobe-analytics/trend';
import { mapOrder } from '@/lib/adobe-analytics/adobe-stock';
import type { AssetRow } from '@/lib/adobe-analytics/types';

function asset(id: number): AssetRow {
  return {
    id,
    title: `Asset ${id}`,
    contentType: 'photo',
    thumbnailUrl: null,
    contributorId: 1,
    contributorName: 'Someone',
    width: 100,
    height: 100,
    keywords: [],
    isGenerativeAi: false,
    downloads: null,
  };
}

describe('tier gating (PROMPT 6.3)', () => {
  it('caps the free tier at exactly 20 rows', () => {
    const g = applyRowGate(12_043, FREE_TIER_RESULT_LIMIT);
    expect(g.visible).toBe(20);
    expect(g.hidden).toBe(12_023);
  });

  it('returns every row when the total is under the cap', () => {
    const g = applyRowGate(9, FREE_TIER_RESULT_LIMIT);
    expect(g).toEqual({ visible: 9, hidden: 0 });
  });

  it('treats -1 as unlimited and never withholds rows', () => {
    expect(isUnlimited(-1)).toBe(true);
    const g = applyRowGate(999_999, -1);
    expect(g).toEqual({ visible: 999_999, hidden: 0 });
  });

  it('honours an admin-configured cap over the tier default', () => {
    // An admin raising Pro to 7 must be respected exactly.
    const g = applyRowGate(500, 7);
    expect(g.visible).toBe(7);
    expect(g.hidden).toBe(493);
  });

  it('never returns more rows than the total when the cap is generous', () => {
    const g = applyRowGate(3, 100);
    expect(g).toEqual({ visible: 3, hidden: 0 });
  });
});

describe('sort mapping', () => {
  it("maps our dropdown values onto Adobe's documented order values", () => {
    expect(mapOrder('relevance')).toBe('relevance');
    expect(mapOrder('newest')).toBe('creation');
    // Adobe supports sorting by download count but never exposing it.
    expect(mapOrder('downloads')).toBe('nb_downloads');
  });
});

describe('recency trend (PROMPT 6.1)', () => {
  it('returns an empty series rather than guessing when data is too thin', () => {
    const out = estimateInterestTrend([asset(1), asset(2)], 2);
    expect(out.points).toEqual([]);
    expect(out.basis).toMatch(/Not enough assets/);
  });

  it('splits results into equal recency bands summing to ~100%', () => {
    const assets = Array.from({ length: 100 }, (_, i) => asset(i));
    const out = estimateInterestTrend(assets, 100);
    expect(out.points).toHaveLength(4);
    const total = out.points.reduce((a, p) => a + p.interest, 0);
    expect(total).toBeCloseTo(100, 0);
    expect(out.points[0].date).toBe('Newest 25%');
  });

  it('never invents a download volume', () => {
    const assets = Array.from({ length: 20 }, (_, i) => asset(i));
    const out = estimateInterestTrend(assets, 20);
    for (const p of out.points) {
      expect(p.estimatedDownloads).toBeNull();
    }
  });

  it('reads an evenly spread set as flat', () => {
    const points = estimateInterestTrend(
      Array.from({ length: 100 }, (_, i) => asset(i)),
      100,
    ).points;
    expect(trendDirection(points)).toBe('flat');
  });

  it('reads a new-heavy distribution as new-heavy', () => {
    // share declines from newest to oldest band.
    const points = [
      { date: 'a', interest: 60, estimatedDownloads: null },
      { date: 'b', interest: 20, estimatedDownloads: null },
    ];
    expect(trendDirection(points)).toBe('down');
  });

  it('labels bands newest-first so the axis reads correctly', () => {
    const points = estimateInterestTrend(
      Array.from({ length: 40 }, (_, i) => asset(i)),
      40,
    ).points;
    expect(points.map((p) => p.date)).toEqual([
      'Newest 25%',
      'Upper-mid',
      'Lower-mid',
      'Oldest 25%',
    ]);
  });
});

describe('sort order is preserved for the asset grid', () => {
  // Regression: an earlier version pulled a creation-ordered sample and
  // assigned it over `files`, so choosing Relevance or Downloads silently
  // rendered the grid newest-first. The grid must keep the user's choice
  // while the chart uses the creation-ordered sample.
  it("keeps the user's sort in the grid rows", async () => {
    const RELEVANCE = [101, 102, 103, 104];
    const CREATION = [201, 202, 203, 204];
    const calls: any[] = [];

    vi.doMock('@/lib/adobe-analytics/adobe-stock', () => ({
      isAdobeConfigured: () => true,
      isConfigurationError: () => false,
      AdobeStockError: class extends Error {},
      mapOrder: (s: string) =>
        s === 'newest' ? 'creation' : s === 'downloads' ? 'nb_downloads' : 'relevance',
      searchAdobeStock: async (params: any) => {
        calls.push(params);
        const ids = params.order === 'creation' ? CREATION : RELEVANCE;
        return {
          nb_results: 50,
          files: ids.map((id) => ({
            id,
            title: `Asset ${id}`,
            content_type: 'photo',
            creator_id: 1,
            creator_name: 'X',
            is_gentech: false,
          })),
        };
      },
    }));
    vi.doMock('@/lib/adobe-analytics/tiers', async () => {
      const actual: any = await vi.importActual('@/lib/adobe-analytics/tiers');
      return {
        ...actual,
        getAnalyticsGate: async () => ({ tier: 'PRO', limit: 100, planName: 'Pro' }),
      };
    });
    vi.doMock('@/lib/db', () => ({ prisma: {} }));

    const { searchByKeyword } = await import('@/lib/adobe-analytics/service');
    const res = await searchByKeyword({
      userId: 'u1',
      query: 'forest',
      sort: 'relevance',
      contentType: 'all',
      generativeAi: 'all',
    });

    // The grid must show the relevance-ordered assets, not the recency sample.
    expect(res.assets.map((a) => a.id)).toEqual(RELEVANCE);
    // The recency call still happened, and it is separate from the grid.
    expect(calls.some((c) => c.order === 'creation')).toBe(true);
    // And a trend was still produced.
    expect(res.trend.length).toBeGreaterThan(0);

    vi.doUnmock('@/lib/adobe-analytics/adobe-stock');
    vi.doUnmock('@/lib/adobe-analytics/tiers');
    vi.doUnmock('@/lib/db');
  });
});
