import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripeCredentials } from '@/lib/payments/config';

export async function getStripe() {
  const creds = await getStripeCredentials();
  const key = creds.secretKey;
  if (!key) throw new Error('stripe_not_configured');
  return new (Stripe as any)(key, {
    apiVersion: '2024-04-10' as any,
  });
}

export async function getStripePublishableKey() {
  const creds = await getStripeCredentials();
  return creds.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
}

export async function stripeCreateCheckout(order: {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  const stripe = await getStripe();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: { name: `StockForge AI Credits — ${order.amountCents / 100} credits` },
          unit_amount: order.amountCents,
        },
      },
    ],
    metadata: { orderId: order.id, userId: order.userId },
    success_url: `${appUrl}/dashboard/billing?success=true&order=${order.id}`,
    cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeId: session.id, metadata: { checkoutUrl: session.url } as any },
  });

  return { ok: true, provider: 'stripe', providerRef: session.id, approvalUrl: session.url! };
}

export async function stripeWebhookVerify(payload: string, sig: string) {
  const stripe = await getStripe();
  const creds = await getStripeCredentials();
  const secret = creds.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET!;
  return stripe.webhooks.constructEvent(payload, sig, secret);
}

export async function stripeCreatePaymentLink(opts: {
  name: string;
  description: string;
  amountCents: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  const stripe = await getStripe();
  const price = await stripe.prices.create({
    currency: opts.currency.toLowerCase(),
    unit_amount: opts.amountCents,
    product_data: { name: opts.name, description: opts.description },
  });
  const link = await stripe.paymentLinks.create({
    price: price.id,
    metadata: opts.metadata as any,
  });
  return link;
}

