import { prisma } from '@/lib/db';
import { addCredits } from '@/lib/credits/engine';
import { createId } from '@/lib/id';
import type { MembershipType, Payment, PaymentStatus } from '@prisma/client';

type Payload = {
  type?: 'plan' | 'credits';
  planId?: string;
  packageId?: string;
  credits?: number;
};

function readPayload(payment: Payment): Payload {
  const raw = (payment.gatewayPayload || {}) as Payload;
  return raw && typeof raw === 'object' ? raw : {};
}

async function activatePlan(userId: string, planId: string, paymentId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('plan_not_found');

  await prisma.membership.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });

  const renewsAt = new Date();
  renewsAt.setMonth(renewsAt.getMonth() + 1);

  await prisma.membership.create({
    data: {
      id: createId(),
      userId,
      planId,
      status: 'ACTIVE',
      renewsAt,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { membership: plan.tier as MembershipType },
  });

  if (plan.creditsIncluded > 0) {
    // M-B4: fold the reason into the addCredits metadata so no second
    // write is needed. A cosmetic `creditTransaction.update` here could
    // throw after credits were granted → payment reverted to PENDING →
    // Stripe webhook retry → double-grant.
    await addCredits(userId, plan.creditsIncluded, 'PURCHASE', {
      paymentId,
      planId,
      reason: `${plan.name} plan credits`,
    });
  }
}

/** Single source of truth for how many credits a credits-type payment grants. */
async function resolvePackageCredits(payload: Payload): Promise<number> {
  let credits = Number(payload.credits || 0);
  if (!credits && payload.packageId) {
    const pkg = await prisma.creditPackage.findUnique({ where: { id: payload.packageId } });
    credits = pkg?.credits ?? 0;
  }
  return credits;
}

async function grantPackageCredits(userId: string, payment: Payment, payload: Payload) {
  const credits = await resolvePackageCredits(payload);
  if (credits <= 0) return;

  // M-B4: reason folded into metadata — no cosmetic second write (see above).
  await addCredits(userId, credits, 'PURCHASE', {
    paymentId: payment.id,
    packageId: payload.packageId,
    reason: 'Credit package purchase',
  });
}

/**
 * Idempotent fulfillment. Safe to call from Stripe webhooks and admin approve.
 *
 * Concurrency-safe: the payment is atomically claimed (PENDING → COMPLETED)
 * before any credits are granted, so concurrent webhooks/approvals cannot
 * double-grant. If the grant itself fails, the claim is reverted to PENDING
 * so the payment can be retried.
 */
export async function fulfillPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false as const, error: 'payment_not_found' };
  if (payment.status === 'COMPLETED') return { ok: true as const, already: true };
  if (payment.status !== 'PENDING') {
    // T4-33: only a PENDING payment can be approved. Previously a REJECTED
    // or VERIFIED payment fell through the failed atomic claim into
    // { ok: true } — the caller believed it was fulfilled when nothing was
    // granted and no status changed. Report the conflict instead.
    return { ok: false as const, error: 'payment_not_pending' };
  }

  const payload = readPayload(payment);
  const planId = payload.planId || (payload.type === 'plan' ? payment.planIdOrCreditPackageId : null);
  const isPlan = payload.type === 'plan' || Boolean(planId && payload.type !== 'credits');
  const effectivePayload: Payload = {
    ...payload,
    packageId: payload.packageId || payment.planIdOrCreditPackageId || undefined,
  };

  if (!(planId && isPlan)) {
    // T4-34: the credits path is the fulfillment — if it resolves to zero
    // credits there is nothing to grant, so refuse BEFORE claiming. The
    // payment stays PENDING instead of ending COMPLETED with no grant.
    const creditsToGrant = await resolvePackageCredits(effectivePayload);
    if (creditsToGrant <= 0) {
      return { ok: false as const, error: 'nothing_to_fulfill' };
    }
  }

  // Atomic claim: only one caller can transition this payment out of PENDING.
  const claimed = await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'COMPLETED', reviewedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: true as const, already: true };

  try {
    if (planId && isPlan) {
      await activatePlan(payment.userId, planId, payment.id);
    } else {
      await grantPackageCredits(payment.userId, payment, effectivePayload);
    }
  } catch (e) {
    // Grant failed after the claim: revert to PENDING so a retry can pick it
    // up. The payment is never left COMPLETED without the credits granted.
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'COMPLETED' },
      data: { status: 'PENDING', reviewedAt: null },
    });
    throw e;
  }

  return { ok: true as const, already: false };
}

export async function rejectPayment(paymentId: string, adminId: string, reason?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false as const, error: 'payment_not_found' };
  if (payment.status === 'COMPLETED') return { ok: false as const, error: 'already_completed' };

  // H4: free the transactionRef in the same update — suffix it with this
  // payment's id so the rejected row no longer holds the bare TrxID. The
  // unique index on transactionRef (db-sync) would otherwise block a
  // corrected re-submission with the original TrxID forever. Idempotent:
  // re-rejecting the same row leaves an already-suffixed ref unchanged.
  const freedRef =
    payment.transactionRef && !payment.transactionRef.endsWith(`:rejected:${payment.id}`)
      ? `${payment.transactionRef}:rejected:${payment.id}`
      : payment.transactionRef;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'REJECTED' as PaymentStatus,
      transactionRef: freedRef,
      reviewedByAdminId: adminId,
      reviewedAt: new Date(),
      gatewayPayload: {
        ...((payment.gatewayPayload as Record<string, unknown>) || {}),
        rejectReason: reason || 'Rejected by admin',
      } as any,
    },
  });

  return { ok: true as const };
}
