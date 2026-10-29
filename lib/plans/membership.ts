import { prisma } from '@/lib/db';
import type { Membership, Plan } from '@prisma/client';

/**
 * Membership expiry (B9-01).
 *
 * Plans are one-time 30-day purchases: `activatePlan` stamps `renewsAt`
 * (+1 month) on the Membership row, but until now nothing ever READ it —
 * every plan sold was effectively lifetime. This module is the single
 * resolution point for "what is this user's current membership":
 *
 * - `isMembershipExpired` — pure predicate (unit-tested).
 * - `getActiveMembership` — returns the user's ACTIVE, non-expired
 *   membership (with its Plan), lazily flipping expired rows to EXPIRED
 *   as it walks past them. When a flip leaves the user with no active
 *   membership, the mirrored `User.membership` enum is reset to FREE
 *   (the reverse of what `activatePlan` does at purchase time).
 * - `flipMembershipToExpired` — the flip + enum-reset used by both the
 *   lazy path and the billing page.
 *
 * Users with NO membership row at all are untouched: their enum tier is
 * a deliberate fallback (seeded / manually created users) and expiring
 * "nothing" must not downgrade them.
 */

export type MembershipWithPlan = Membership & { plan: Plan };

/** Expired iff a renewal/expiry instant exists and has been reached. */
export function isMembershipExpired(
  membership: { renewsAt: Date | null | undefined },
  now: Date = new Date(),
): boolean {
  return membership.renewsAt != null && membership.renewsAt.getTime() <= now.getTime();
}

/**
 * Flip one ACTIVE membership to EXPIRED (atomic status guard, so a
 * concurrent resolver can't double-flip). If the user then has no
 * remaining ACTIVE, non-expired membership, mirror the downgrade onto
 * `User.membership` ('FREE') — the same enum `activatePlan` sets at
 * purchase time.
 */
export async function flipMembershipToExpired(membership: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const flipped = await prisma.membership.updateMany({
    where: { id: membership.id, status: 'ACTIVE' },
    data: { status: 'EXPIRED' },
  });
  if (flipped.count === 0) return false;

  const now = new Date();
  const remaining = await prisma.membership.findFirst({
    where: {
      userId: membership.userId,
      status: 'ACTIVE',
      OR: [{ renewsAt: null }, { renewsAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (!remaining) {
    await prisma.user.update({
      where: { id: membership.userId },
      data: { membership: 'FREE' },
    });
  }
  return true;
}

/**
 * The user's current membership: the latest ACTIVE row that has not
 * reached its `renewsAt`. Expired rows encountered on the way are
 * flipped to EXPIRED (see above). Returns null when the user has no
 * live membership — callers fall back to the `User.membership` enum.
 */
export async function getActiveMembership(
  userId: string,
): Promise<MembershipWithPlan | null> {
  for (;;) {
    const membership = await prisma.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    });
    if (!membership) return null;
    if (!isMembershipExpired(membership)) return membership;
    const flipped = await flipMembershipToExpired(membership);
    if (!flipped) {
      // Lost a race with another resolver flipping the same row; the
      // next iteration re-reads current state. Guard against spinning
      // on a row that somehow stays ACTIVE and expired: if the same id
      // comes back again, bail out and treat it as expired.
      const again = await prisma.membership.findUnique({
        where: { id: membership.id },
        select: { status: true },
      });
      if (again?.status === 'ACTIVE') return null;
    }
  }
}
