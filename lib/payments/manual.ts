import { prisma } from '@/lib/db';
import { randomString } from '@/lib/utils';

export interface ManualPaymentRequest {
  provider: 'bkash' | 'nagad';
  amountCents: number;
  currency: string;
  phone: string;
  orderId: string;
}

export interface ManualPaymentResult {
  ok: boolean;
  provider: string;
  providerRef: string;
  instructions?: string;
  qrUrl?: string;
  error?: string;
}

/**
 * bKash / Nagad manual payment module.
 * In production this would call the real gateway's checkout API. Here we
 * generate a provider reference + payment instructions so the flow is
 * end-to-end testable, and the webhook/confirm path is wired through
 * confirmPayment() in the gateway.
 */
export async function manualCreatePayment(
  order: { id: string; amountCents: number; currency: string },
  provider: 'bkash' | 'nagad',
): Promise<Omit<import('@/lib/payments/gateway').PaymentResult, 'order'>> {
  const cfg =
    provider === 'bkash'
      ? {
          appKey: process.env.BKASH_APP_KEY,
          appPassword: process.env.BKASH_APP_PASSWORD,
          username: process.env.BKASH_USERNAME,
          password: process.env.BKASH_PASSWORD,
        }
      : {
          appKey: process.env.NAGAD_APP_KEY,
          appPassword: process.env.NAGAD_APP_PASSWORD,
          username: process.env.NAGAD_USERNAME,
          password: process.env.NAGAD_PASSWORD,
        };

  if (!cfg.appKey || !cfg.appPassword) {
    return {
      ok: false,
      provider,
      providerRef: '',
      instructions: '',
      error: `${provider}_not_configured`,
    };
  }

  const ref = `${provider.toUpperCase()}-${randomString(12).toUpperCase()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const amount = (order.amountCents / 100).toFixed(2);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      metadata: {
        provider: provider,
        ref,
        amount,
        currency: order.currency,
        callbackUrl: `${appUrl}/api/payments/${provider}/callback`,
      } as any,
    },
  });

  const instructions =
    provider === 'bkash'
      ? `Dial *248# on your bKash phone, enter Merchant ID ${cfg.username}, amount ${amount} ${order.currency}, and confirm with ref ${ref}.`
      : `Open your Nagad app, tap "Send Money" → Merchant, enter merchant ID ${cfg.username}, amount ${amount} ${order.currency}, confirm with ref ${ref}.`;

  return {
    ok: true,
    provider,
    providerRef: ref,
    instructions,
  };
}

export async function verifyManualPayment(provider: 'bkash' | 'nagad', ref: string) {
  const order = await prisma.order.findFirst({
    where: { provider, metadata: { path: ['ref'], equals: ref } as any },
  });
  if (!order) return { ok: false as const, error: 'order_not_found' };
  if (order.status === 'PAID') return { ok: true as const };
  return { ok: true as const, order };
}
