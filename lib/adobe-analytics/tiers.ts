import { prisma } from '@/lib/db';
import { getActiveMembership } from '@/lib/plans/membership';

/**
 * Adobe Analytics result gating (PROMPT 6.3).
 *
 * This module does NOT consume image-generation credits — access is purely a
 * function of the member's plan tier. The row cap itself lives on the Plan
 * row (`adobeAnalyticsResultLimit`) so an admin can change it from the admin
 * panel without a redeploy:
 *
 *   0                -> fully locked: no results at all (a REAL value
 *                       when it comes from a Plan row — see
 *                       normalizeLimit)
 *   positive         -> hard cap in rows
 *  -1                -> unlimited (Agency by default)
 *
 * The daily SEARCH cap follows the same resolution: the Plan row's
 * `adobeAnalyticsDailyCap` wins when set, otherwise the global default
 * (env `ADOBE_DAILY_SEARCH_LIMIT`, else 30).
 *
 * Resolution order: the user's ACTIVE membership's Plan row wins. Users with
 * no active membership row fall back to their `User.membership` enum and
 * finally to FREE, so the cap always applies.
 */

export type AdobeTier = 'FREE' | 'PRO' | 'PLUS' | 'AGENCY' | 'ENTERPRISE';

/** Free tier sees one full page of results (100 rows). Admins steer
 *  every plan by PAGES from the admin panel (stored as rows = pages x
 *  100 on the Plan row); this constant is only the fallback for a FREE
 *  plan whose stored limit was never configured. */
export const FREE_TIER_RESULT_LIMIT = 100;

export interface AnalyticsGate {
  tier: AdobeTier;
  /** Number of rows the user may see in full. -1 = unlimited, 0 = locked. */
  limit: number;
  /** Plan name for display, e.g. "Free". */
  planName: string;
  /** Max search attempts per day (plan-aware; see resolveDailyCap). */
  dailyCap: number;
}

/** Global default for the per-user daily Adobe search cap. */
export const DEFAULT_DAILY_SEARCH_CAP = 30;

/**
 * The deployment-wide daily search cap from the environment.
 * `ADOBE_DAILY_SEARCH_LIMIT` overrides the default of 30 — parsed
 * explicitly so an intentional `0` ("block all non-admin searches")
 * works; `Number(...) || 30` silently turned 0 back into 30 (audit
 * R7-09). Unset/invalid/negative → 30. (Moved here from the route so
 * the gate and the route can never disagree about the default.)
 */
export function envDailySearchCap(): number {
  const parsed = Number.parseInt(process.env.ADOBE_DAILY_SEARCH_LIMIT ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_SEARCH_CAP;
}

/**
 * Plan-aware daily search cap (R9 N3): a Plan row's
 * `adobeAnalyticsDailyCap` wins when set (including an intentional 0);
 * null = "not configured on the plan" → the global env default.
 */
export function resolveDailyCap(planCap: number | null | undefined): number {
  return typeof planCap === 'number' && planCap >= 0 ? planCap : envDailySearchCap();
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/**
 * Per-user daily budget on FETCHED Adobe rows (R9 B9-07). The 30/day
 * cap counts search ATTEMPTS, but one attempt can bill up to ~1000
 * actor rows and the per-contributor continuation budget still allows
 * ~30 contributors × ~1000 rows a day — attempts alone do not bound
 * the owner's Apify spend. This budget sums the rows today's real
 * actor runs actually fetched (recorded per search in
 * AdobeAnalyticsQuery.resultData) and refuses a new run that would
 * push the day over the top. Cache hits fetch nothing and never count.
 */
export const MAX_DAILY_FETCH_ROWS = 5000;

/**
 * Rows a contributor actor run will be billed for at the given tier
 * limit and requested depth — mirrors the `allowed` computation in
 * searchByContributor() (want normalized to [10, 1000], then clamped
 * by the tier limit). Keep the two in step.
 */
export function plannedContributorFetchRows(limit: number, want: number | undefined): number {
  const depth = Math.min(1000, Math.max(10, want ?? 100));
  return isUnlimited(limit) ? depth : Math.min(limit, depth);
}

/**
 * Rows a keyword actor run will be billed for at the given tier limit
 * — mirrors the `allowed` computation in searchByKeyword().
 */
export function plannedKeywordFetchRows(limit: number): number {
  return isUnlimited(limit) ? 100 : Math.min(limit, 100);
}

/**
 * Caps a row count to the tier limit and reports how many are withheld.
 * The caller passes the true total so the UI can say "12,043 of 20 shown"
 * without ever shipping the locked rows to the client.
 */
export function applyRowGate(total: number, limit: number): { visible: number; hidden: number } {
  if (isUnlimited(limit)) {
    return { visible: Math.max(0, total), hidden: 0 };
  }
  // A limit of 0 is a REAL lock (R9 N3): nothing is visible and every
  // row counts as hidden, so the client renders the upgrade gate. (The
  // old `limit <= 0` branch lumped 0 in with unlimited and showed
  // everything — the exact opposite of a lock.)
  if (limit <= 0) {
    return { visible: 0, hidden: Math.max(0, total) };
  }
  if (total <= limit) return { visible: total, hidden: 0 };
  return { visible: limit, hidden: total - limit };
}

/**
 * Resolves the Adobe Analytics row cap for a user.
 *
 * Prefers the Plan row attached to the user's ACTIVE membership (so admin
 * edits to `adobeAnalyticsResultLimit` take effect immediately). With no
 * active membership row, the `User.membership` enum picks the tier and
 * THAT tier's active Plan row supplies the caps when one exists — the
 * code constants are only the last resort for a tier with no Plan row,
 * so seeded or manually-created users are still gated.
 */
export async function getAnalyticsGate(userId: string): Promise<AnalyticsGate> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membership: true },
  });

  // B9-01: resolve through the expiry-aware helper — an ACTIVE row past
  // its renewsAt is flipped to EXPIRED and no longer gates as paid.
  const membership = await getActiveMembership(userId);

  if (membership?.plan) {
    const limit = normalizeLimit(membership.plan.adobeAnalyticsResultLimit, membership.plan.tier);
    return {
      tier: membership.plan.tier as AdobeTier,
      limit,
      planName: membership.plan.name,
      dailyCap: resolveDailyCap(membership.plan.adobeAnalyticsDailyCap),
    };
  }

  // No ACTIVE membership row: the enum picks the tier, but the caps
  // still come from that tier's Plan row when one exists (T4-13).
  // Most free users land here — register never creates a Membership
  // row (B9-08) — and resolving them from the code constants alone
  // silently ignored every admin page-limit / daily-cap edit to the
  // Free plan. Plan-row semantics match the membership path above
  // exactly: a stored 0 is a real lock (normalizeLimit) and the
  // plan's daily cap wins when set (resolveDailyCap). The constants
  // remain the fallback only when the tier has no active Plan row.
  // (The enum is trustworthy here: the B9-01 expiry flip resets it
  // to FREE when a paid membership lapses with none remaining.)
  const tier = ((user?.membership || 'FREE') as AdobeTier) || 'FREE';
  const plan = await prisma.plan.findFirst({
    where: { tier: tier as any, isActive: true },
    select: { name: true, adobeAnalyticsResultLimit: true, adobeAnalyticsDailyCap: true },
  });
  if (plan) {
    return {
      tier,
      limit: normalizeLimit(plan.adobeAnalyticsResultLimit, tier),
      planName: plan.name,
      dailyCap: resolveDailyCap(plan.adobeAnalyticsDailyCap),
    };
  }
  return {
    tier,
    limit: fallbackLimitForTier(tier),
    planName: tier.charAt(0) + tier.slice(1).toLowerCase(),
    dailyCap: envDailySearchCap(),
  };
}

/**
 * Normalize a Plan row's stored `adobeAnalyticsResultLimit` (R9 N3).
 *
 * This is called ONLY with a value read from an actual Plan row on an
 * ACTIVE membership, and there a stored 0 is a REAL limit — the admin
 * set the plan to 0 pages, so the plan is fully locked and the search
 * returns the upgrade gate instead of results. (It used to be treated
 * as a "not configured" sentinel and silently upgraded to the tier
 * fallback, which made a locked state impossible to express.)
 *
 * The tier fallback survives ONLY for a missing value (null/undefined
 * — no stored configuration at all) and for unrecognized negatives.
 * Both getAnalyticsGate call sites pass a genuine Plan-row value (the
 * active membership's plan, or the enum tier's plan on the T4-13
 * path); users whose tier has no Plan row at all never reach this
 * function (the enum path applies fallbackLimitForTier directly).
 */
export function normalizeLimit(raw: number | null | undefined, tier: string): number {
  if (raw === -1) return -1;
  if (typeof raw === 'number' && raw >= 0) return raw;
  return fallbackLimitForTier(tier as AdobeTier);
}

function fallbackLimitForTier(tier: AdobeTier): number {
  switch (tier) {
    case 'PRO':
      return 100;
    case 'PLUS':
      return 500;
    case 'AGENCY':
    case 'ENTERPRISE':
      return -1;
    case 'FREE':
    default:
      return FREE_TIER_RESULT_LIMIT;
  }
}
