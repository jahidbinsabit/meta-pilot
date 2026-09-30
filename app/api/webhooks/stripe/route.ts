import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fulfillPayment, rejectPayment } from '@/lib/payments/fulfill';
import Stripe from 'stripe';

export const runtime = 'nodejs';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('stripe_not_configured');
  return new Stripe(key, { apiVersion: '2024-04-10' as any });
}

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

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);

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
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
