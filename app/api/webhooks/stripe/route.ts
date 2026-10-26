import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fulfillPayment, rejectPayment } from '@/lib/payments/fulfill';
import { getStripe } from '@/lib/payments/stripe';
import { getStripeCredentials } from '@/lib/payments/config';
import Stripe from 'stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      console.error('[stripe-webhook] No stripe-signature header found');
      return new Response(JSON.stringify({ error: 'no_signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // M3: resolve credentials the same way checkout does — the admin-managed
    // gateway config (DB) first, env vars as fallback (getStripeCredentials).
    // The old env-only reads meant rotating keys in the admin panel silently
    // broke signature verification here (the env-vs-DB split).
    const { webhookSecret } = await getStripeCredentials();
    if (!webhookSecret) {
      console.error('[stripe-webhook] Stripe webhook secret is not configured');
      return new Response(JSON.stringify({ error: 'webhook_not_configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripe = await getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    console.log(`[stripe-webhook] Event received: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await prisma.payment.findFirst({
        where: { transactionRef: session.id },
      });

      if (!payment) {
        console.error(`[stripe-webhook] Payment not found for session ${session.id}`);
        return NextResponse.json({ received: true });
      }

      // M3: `checkout.session.completed` also fires for sessions whose
      // payment is still pending (async payment methods) — fulfilling
      // those would grant credits for money not yet received. Acknowledge
      // (200) so Stripe stops retrying, but do NOT fulfill; the session's
      // later success arrives as a separate event.
      if (session.payment_status !== 'paid') {
        console.log(
          `[stripe-webhook] Session ${session.id} completed with payment_status=${session.payment_status} — not fulfilling payment ${payment.id}`,
        );
        return NextResponse.json({ received: true });
      }

      // M3: never fulfill a session whose amount/currency disagrees with
      // the stored Payment row. Stripe checkout sessions for this app are
      // always created in USD with unit_amount = round(amountUSD × 100)
      // (see payments/create), so the comparison is exact minor units.
      const expectedMinorUnits = Math.round(payment.amountUSD * 100);
      const sessionCurrency = (session.currency || '').toLowerCase();
      const metadataUserId = session.metadata?.userId;
      if (
        session.amount_total !== expectedMinorUnits ||
        sessionCurrency !== 'usd' ||
        (metadataUserId && metadataUserId !== payment.userId)
      ) {
        console.error(
          `[stripe-webhook] Session ${session.id} verification failed for payment ${payment.id}: ` +
            `amount_total=${session.amount_total} (expected ${expectedMinorUnits}), ` +
            `currency=${session.currency} (expected usd), ` +
            `metadata.userId=${metadataUserId ?? 'none'} (payment user ${payment.userId}) — not fulfilling`,
        );
        return NextResponse.json({ received: true });
      }

      const result = await fulfillPayment(payment.id);
      if (!result.ok) {
        console.error(`[stripe-webhook] Fulfillment failed for ${payment.id}: ${result.error}`);
      } else {
        console.log(
          `[stripe-webhook] Payment ${payment.id} ${result.already ? 'already completed' : 'fulfilled'}`,
        );
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await prisma.payment.findFirst({
        where: { transactionRef: session.id, status: 'PENDING' },
      });

      if (payment) {
        await rejectPayment(payment.id, 'stripe-webhook', 'Checkout session expired');
        console.log(`[stripe-webhook] Payment ${payment.id} marked as rejected (session expired)`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('[stripe-webhook] Webhook processing failed:', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
