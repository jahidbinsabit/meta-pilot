import { z } from 'zod';

/** Sort options exposed by the "Sort By" dropdown. */
export const sortValues = ['relevance', 'newest', 'downloads'] as const;
export type SortValue = (typeof sortValues)[number];

/** Content-type filter. */
export const contentTypeValues = ['all', 'photo', 'vector', 'illustration'] as const;
export type ContentTypeValue = (typeof contentTypeValues)[number];

/** Generative-AI provenance filter. */
export const generativeAiValues = ['all', 'include', 'exclude'] as const;
export type GenerativeAiValue = (typeof generativeAiValues)[number];

export const keywordSearchSchema = z.object({
  query: z.string().trim().min(1, 'Enter a keyword').max(120, 'Keyword is too long'),
  sort: z.enum(sortValues).default('relevance'),
  contentType: z.enum(contentTypeValues).default('all'),
  generativeAi: z.enum(generativeAiValues).default('all'),
});

export const contributorSearchSchema = z.object({
  contributorId: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Contributor ID must be numeric')
    .max(20, 'Contributor ID is too long'),
});

/** One asset row as returned to the client. */
export interface AssetRow {
  id: number;
  title: string;
  contentType: string;
  thumbnailUrl: string | null;
  thumbnail500Url?: string | null;
  detailsUrl?: string | null;
  contributorId: number | null;
  contributorName: string | null;
  countryName?: string | null;
  width: number | null;
  height: number | null;
  keywords: string[];
  isGenerativeAi: boolean;
  creationDate?: string | null;
  publishedAgo?: string | null;
  /**
   * Real download count extracted via Adobe Stock Scraper.
   */
  downloads: number | null;
  /**
   * Total view count.
   */
  views?: number | null;
}

export function formatPublishedAgo(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30.4375);
  const diffYears = Math.floor(diffDays / 365.25);

  if (diffYears >= 1) {
    return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  }
  if (diffMonths >= 1) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  }
  if (diffDays >= 1) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs >= 1) {
    return `${diffHrs} ${diffHrs === 1 ? 'hour' : 'hours'} ago`;
  }
  return 'Just now';
}

export interface TrendPoint {
  /**
   * Recency band label (e.g. "Newest 25%"). Adobe publishes no asset dates,
   * so there is no calendar date to show.
   */
  date: string;
  /** Share of the result set in this band, 0-100. */
  interest: number;
  /** Always null: download volume is not derivable. */
  estimatedDownloads: number | null;
}

export interface KeywordSearchResult {
  query: string;
  sort: SortValue;
  contentType: ContentTypeValue;
  generativeAi: GenerativeAiValue;
  /** Exact total Adobe reported, or null when Adobe gave none. */
  totalResults: number | null;
  /** True when totalResults came from Adobe rather than being estimated. */
  totalIsExact: boolean;
  assets: AssetRow[];
  /** Rows withheld by the tier cap. */
  hiddenCount: number;
  limit: number;
  tier: string;
  planName: string;
  trend: TrendPoint[];
  /** "adobe" when the series is real API data, "estimated" when modelled. */
  trendSource: 'adobe' | 'estimated';
  /** Estimator inputs so the methodology is auditable in the UI. */
  trendBasis: string;
  /** True when Adobe's response carried per-asset download counts. */
  downloadsAvailable: boolean;
  /** Populated when the Adobe call failed but a partial result exists. */
  warning?: string;
}

export interface ContributorResult {
  contributorId: number;
  contributorName: string | null;
  totalAssets: number | null;
  totalIsExact: boolean;
  assets: AssetRow[];
  hiddenCount: number;
  limit: number;
  tier: string;
  planName: string;
  /** Aggregate stats Adobe actually returned. Empty when unavailable. */
  aggregate: {
    byContentType: { type: string; count: number }[];
    totalKeywords: number;
  };
  warning?: string;
}
