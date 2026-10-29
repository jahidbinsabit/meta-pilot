import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fulfillPayment, rejectPayment, clawbackRefundedPayment } from '@/lib/payments/fulfill';
import { getStripe } from '@/lib/payments/stripe';
import { getStripeCredentials } from '@/lib/payments/config';
import { writeAudit } from '@/lib/audit';
import type { Payment } from '@prisma/client';
import Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * Verify + fulfill a paid checkout session. Shared by
 * `checkout.session.completed` (synchronous payment methods) and
 * `checkout.session.async_payment_succeeded` (B9-03 — async methods
 * settle later; the completed event for them arrives with
 * payment_status != 'paid' and must NOT fulfill, the success event is
 * where the money actually landed).
 */
async function processPaidCheckoutSession(session: Stripe.Checkout.Session) {
  const payment = await prisma.payment.findFirst({
    where: { transactionRef: session.id },
  });

  if (!payment) {
    console.error(`[stripe-webhook] Payment not found for session ${session.id}`);
    return;
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
    return;
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
    return;
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

/**
 * Resolve the stored Payment for a Stripe charge/dispute. Payment rows
 * key on the checkout session id (`transactionRef`), and a Charge does
 * not carry the session id — walk payment_intent → checkout sessions →
 * session id, the most reliable stored key available.
 */
async function resolvePaymentForCharge(
  stripe: Stripe,
  paymentIntent: string | Stripe.PaymentIntent | null | undefined,
): Promise<Payment | null> {
  const paymentIntentId =
    typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? null);
  if (!paymentIntentId) return null;
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  const session = sessions.data[0];
  if (!session) return null;
  return prisma.payment.findFirst({ where: { transactionRef: session.id } });
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

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      await processPaidCheckoutSession(session);
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

    // B9-02: money going back out must take its credits with it.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const payment = await resolvePaymentForCharge(stripe, charge.payment_intent);
      if (!payment) {
        console.error(
          `[stripe-webhook] charge.refunded ${charge.id}: no stored payment resolved — no clawback`,
        );
      } else {
        const result = await clawbackRefundedPayment(payment.id, 'charge.refunded');
        console.log(
          `[stripe-webhook] charge.refunded ${charge.id}: payment ${payment.id} ` +
            (result.already
              ? 'already reversed / not completed — no-op'
              : `marked REFUNDED, clawed back ${result.clawedCredits ?? 0} credits`),
        );
      }
    }

    // B9-02: a dispute that closes LOST is a chargeback — same reversal.
    // Won/closed-otherwise disputes leave the payment untouched.
    if (event.type === 'charge.dispute.closed') {
      const dispute = event.data.object as Stripe.Dispute;
      if (dispute.status === 'lost') {
        const payment = await resolvePaymentForCharge(stripe, dispute.payment_intent);
        if (!payment) {
          console.error(
            `[stripe-webhook] charge.dispute.closed (lost) ${dispute.id}: no stored payment resolved — no clawback`,
          );
        } else {
          const result = await clawbackRefundedPayment(payment.id, 'charge.dispute.closed');
          console.log(
            `[stripe-webhook] charge.dispute.closed (lost) ${dispute.id}: payment ${payment.id} ` +
              (result.already
                ? 'already reversed / not completed — no-op'
                : `marked REFUNDED, clawed back ${result.clawedCredits ?? 0} credits`),
          );
        }
      }
    }

    // Disputes are flagged for a human the moment they open — audit
    // trail only, no money movement until the dispute closes.
    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;
      try {
        const payment = await resolvePaymentForCharge(stripe, dispute.payment_intent);
        await writeAudit({
          adminId: 'stripe-webhook',
          action: 'stripe_dispute_created',
          targetType: 'Payment',
          targetId: payment?.id ?? dispute.id,
          after: {
            disputeId: dispute.id,
            chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
            amount: dispute.amount,
            currency: dispute.currency,
            reason: dispute.reason,
            status: dispute.status,
            paymentId: payment?.id ?? null,
          },
        });
        console.log(
          `[stripe-webhook] charge.dispute.created ${dispute.id} recorded in audit log (payment ${payment?.id ?? 'unresolved'})`,
        );
      } catch (auditErr) {
        // The audit entry must never fail the webhook — Stripe retries
        // would re-deliver every other handler for this event too.
        console.error('[stripe-webhook] dispute audit entry failed:', auditErr);
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
