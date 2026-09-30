import { prisma } from '@/lib/db';

/**
 * Batch upload limit per plan tier.
 * Free = 3, Pro = 25, Agency = unlimited (-1).
 * The limit is derived from the plan's `features.batchLimit` JSON field so
 * the admin can change it from the admin panel without a deploy.
 */
export async function getBatchLimitForUser(userId: string): Promise<number> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });
  if (!membership?.plan) return 3; // default free-tier limit
  const features = (membership.plan.features as any) || {};
  const limit = features.batchLimit;
  if (typeof limit === 'number' && limit > 0) return limit;
  if (limit === -1 || limit === 'unlimited') return -1;
  // Tier-based fallback.
  switch (membership.plan.tier) {
    case 'FREE':
      return 3;
    case 'PRO':
      return 25;
    case 'PLUS':
      return 50;
    case 'AGENCY':
      return -1;
    default:
      return 3;
  }
}

export async function getMembershipTier(userId: string): Promise<string> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });
  return membership?.plan?.tier || 'FREE';
}
