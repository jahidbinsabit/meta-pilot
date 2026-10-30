import { prisma } from '@/lib/db';

/**
 * Batch upload limit — 100 for everyone (owner's policy, Oct 2026).
 * A plan can still override via its `features.batchLimit` JSON field
 * (positive number, or -1 / 'unlimited'), but any value is capped at the
 * API maximum of 100 (see MAX_BATCH_SIZE in app/api/generate/batch/route.ts).
 */
export const UNIVERSAL_BATCH_LIMIT = 100;

export async function getBatchLimitForUser(userId: string): Promise<number> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });
  const features = (membership?.plan?.features as any) || {};
  const limit = features.batchLimit;
  if (typeof limit === 'number' && limit > 0)
    return Math.min(limit, UNIVERSAL_BATCH_LIMIT);
  // -1 / 'unlimited' (and any unset value) → universal limit.
  return UNIVERSAL_BATCH_LIMIT;
}

