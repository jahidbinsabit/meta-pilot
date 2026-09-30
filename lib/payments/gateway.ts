import { prisma } from '@/lib/db';
import { addCredits } from '@/lib/credits/engine';
import { stripeCreateCheckout } from '@/lib/payments/stripe';
import { manualCreatePayment } from '@/lib/payments/manual';
import type { Order } from '@prisma/client';

export type PaymentProvider = 'stripe' | 'bkash' | 'nagad';

export interface PaymentRequest {
  userId: string;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  packageId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  ok: boolean;
  provider: string;
  providerRef?: string;
  approvalUrl?: string;
  instructions?: string;
  error?: string;
  order?: Order;
}

/**
 * Unified payment entrypoint. Provider is selected per-order (stored on the
 * Order row) so the admin can enable/disable gateways without a deploy.
 */
export async function createPayment(req: PaymentRequest): Promise<PaymentResult> {
  const order = await prisma.order.create({
    data: {
      userId: req.userId,
      provider: req.provider,
      amountCents: req.amountCents,
      currency: req.currency,
      status: 'PENDING',
      metadata: req.metadata as any,
    },
  });

  let result: Omit<PaymentResult, 'order'>;
  switch (req.provider) {
    case 'stripe':
      result = await stripeCreateCheckout(order as any);
      break;
    case 'bkash':
    case 'nagad':
      result = await manualCreatePayment(order as any, req.provider);
      break;
    default:
      return { ok: false, provider: req.provider, error: 'unsupported_provider', order };
  }

  return { ...result, order };
}

/**
 * Confirm a payment after the provider calls back. Credits the user.
 * Idempotent — a PAID order is never credited twice.
 */
export async function confirmPayment(
  provider: PaymentProvider,
  providerRef: string,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findFirst({
    where: { stripeId: providerRef, status: 'PENDING' },
  });
  if (!order) {
    // fall back to manual ref
    const manual = await prisma.order.findFirst({
      where: { provider, status: 'PENDING', metadata: { equals: { ref: providerRef } } as any },
    });
    if (!manual) return { ok: false, error: 'order_not_found' };
    return applyPayment(manual, metadata);
  }
  return applyPayment(order, metadata);
}

async function applyPayment(order: Order, metadata?: Record<string, unknown>) {
  if (order.status === 'PAID') return { ok: true };
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'PAID',
      stripeId: order.stripeId || (metadata?.ref as string),
      metadata: metadata as any,
    },
  });
  const credits = (metadata?.credits as number) || Math.floor(order.amountCents / 100);
  await addCredits(order.userId, credits, `payment_${order.provider}`, {
    orderId: order.id,
    amountCents: order.amountCents,
  });
  return { ok: true };
}

export async function refundOrder(orderId: string, reason: string) {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'REFUNDED', metadata: { refundReason: reason } as any },
  });
  return order;
}
