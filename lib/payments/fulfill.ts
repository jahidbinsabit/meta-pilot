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
    const result = await addCredits(userId, plan.creditsIncluded, 'PURCHASE', {
      paymentId,
      planId,
    });
    await prisma.creditTransaction.update({
      where: { id: result.transactionId },
      data: { reason: `${plan.name} plan credits` },
    });
  }
}

async function grantPackageCredits(userId: string, payment: Payment, payload: Payload) {
  let credits = Number(payload.credits || 0);
  if (!credits && payload.packageId) {
    const pkg = await prisma.creditPackage.findUnique({ where: { id: payload.packageId } });
    credits = pkg?.credits ?? 0;
  }
  if (credits <= 0) return;

  const result = await addCredits(userId, credits, 'PURCHASE', {
    paymentId: payment.id,
    packageId: payload.packageId,
  });
  await prisma.creditTransaction.update({
    where: { id: result.transactionId },
    data: { reason: 'Credit package purchase' },
  });
}

/**
 * Idempotent fulfillment. Safe to call from Stripe webhooks and admin approve.
 */
export async function fulfillPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false as const, error: 'payment_not_found' };
  if (payment.status === 'COMPLETED') return { ok: true as const, already: true };

  const payload = readPayload(payment);
  const planId = payload.planId || (payload.type === 'plan' ? payment.planIdOrCreditPackageId : null);
  const isPlan = payload.type === 'plan' || Boolean(planId && payload.type !== 'credits');

  if (planId && isPlan) {
    await activatePlan(payment.userId, planId, payment.id);
  } else {
    await grantPackageCredits(payment.userId, payment, {
      ...payload,
      packageId: payload.packageId || payment.planIdOrCreditPackageId || undefined,
    });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'COMPLETED', reviewedAt: new Date() },
  });

  return { ok: true as const, already: false };
}

export async function rejectPayment(paymentId: string, adminId: string, reason?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false as const, error: 'payment_not_found' };
  if (payment.status === 'COMPLETED') return { ok: false as const, error: 'already_completed' };

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'REJECTED' as PaymentStatus,
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
