import { prisma } from '@/lib/db';

/**
 * Adobe Analytics result gating (PROMPT 6.3).
 *
 * This module does NOT consume image-generation credits — access is purely a
 * function of the member's plan tier. The row cap itself lives on the Plan
 * row (`adobeAnalyticsResultLimit`) so an admin can change it from the admin
 * panel without a redeploy:
 *
 *   0  or positive -> hard cap, free tier
 *  -1               -> unlimited (Agency by default)
 *
 * Resolution order: the user's ACTIVE membership's Plan row wins. Users with
 * no active membership row fall back to their `User.membership` enum and
 * finally to FREE, so the cap always applies.
 */

export type AdobeTier = 'FREE' | 'PRO' | 'PLUS' | 'AGENCY' | 'ENTERPRISE';

/** Free tier sees this many rows; the rest render blurred behind the CTA. */
export const FREE_TIER_RESULT_LIMIT = 20;

export interface AnalyticsGate {
  tier: AdobeTier;
  /** Number of rows the user may see in full. -1 = unlimited. */
  limit: number;
  /** Plan name for display, e.g. "Free". */
  planName: string;
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

/**
 * Caps a row count to the tier limit and reports how many are withheld.
 * The caller passes the true total so the UI can say "12,043 of 20 shown"
 * without ever shipping the locked rows to the client.
 */
export function applyRowGate(total: number, limit: number): { visible: number; hidden: number } {
  if (isUnlimited(limit) || limit <= 0) {
    return { visible: Math.max(0, total), hidden: 0 };
  }
  if (total <= limit) return { visible: total, hidden: 0 };
  return { visible: limit, hidden: total - limit };
}

/**
 * Resolves the Adobe Analytics row cap for a user.
 *
 * Prefers the Plan row attached to the user's ACTIVE membership (so admin
 * edits to `adobeAnalyticsResultLimit` take effect immediately). Falls back
 * to the `User.membership` enum when no membership row exists, so seeded or
 * manually-created users are still gated.
 */
export async function getAnalyticsGate(userId: string): Promise<AnalyticsGate> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membership: true },
  });

  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });

  if (membership?.plan) {
    const limit = normalizeLimit(membership.plan.adobeAnalyticsResultLimit, membership.plan.tier);
    return {
      tier: membership.plan.tier as AdobeTier,
      limit,
      planName: membership.plan.name,
    };
  }

  // No Plan row attached: derive the cap from the membership enum alone.
  const tier = ((user?.membership || 'FREE') as AdobeTier) || 'FREE';
  return {
    tier,
    limit: fallbackLimitForTier(tier),
    planName: tier.charAt(0) + tier.slice(1).toLowerCase(),
  };
}

/**
 * A FREE plan row seeded with `adobeAnalyticsResultLimit: 0` means "free
 * tier, show the standard 20" — 0 is the "not configured" sentinel in the
 * seed, not a real "show nothing" cap.
 */
function normalizeLimit(raw: number | null | undefined, tier: string): number {
  if (raw === -1) return -1;
  if (typeof raw === 'number' && raw > 0) return raw;
  return tier === 'FREE' ? FREE_TIER_RESULT_LIMIT : fallbackLimitForTier(tier as AdobeTier);
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
