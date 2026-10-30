import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { paymentMethodFromGateway, toPublicGateway } from '@/lib/payments/public';
import { getStripe } from '@/lib/payments/stripe';
import { createId } from '@/lib/id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();

    // R9 S9-04: each call mints a PENDING manual payment (admin queue)
    // or a live Stripe checkout session — cap per user.
    const rl = rateLimit(`payments-create:${user.id}`, {
      max: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = await req.json();
    const {
      type = 'credits',
      planId,
      packageId,
      currency = 'USD',
      provider = 'stripe',
      senderNumber,
      transactionRef,
    } = body;

    if (type === 'plan' && !planId) {
      return NextResponse.json({ error: 'plan_id_required' }, { status: 400 });
    }

    let amountUSD = 0;
    let amountBDT = 0;
    let payload: Record<string, unknown> = { type };
    let productName = 'MetaCSV purchase';

    if (type === 'plan') {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      // B9-19: a delisted plan is not purchasable, even by direct API
      // call with a known id — same error shape as a missing plan.
      if (!plan || plan.isActive === false) {
        return NextResponse.json({ error: 'plan_not_found' }, { status: 400 });
      }
      amountUSD = plan.monthlyPriceUSD;
      amountBDT = plan.monthlyPriceBDT;
      productName = `MetaCSV ${plan.name} plan`;
      payload = { type: 'plan', planId, planName: plan.name, credits: plan.creditsIncluded };
    } else if (packageId) {
      const pkg = await prisma.creditPackage.findUnique({ where: { id: packageId } });
      // B9-19: delisted packages are not purchasable by id either.
      if (!pkg || pkg.isActive === false) {
        return NextResponse.json({ error: 'package_not_found' }, { status: 400 });
      }
      amountUSD = pkg.priceUSD;
      amountBDT = pkg.priceBDT;
      productName = `${pkg.credits} MetaCSV credits`;
      payload = { type: 'credits', packageId, packageName: pkg.name, credits: pkg.credits };
    } else {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    // T1-05: a zero-price plan/package (e.g. the FREE plan) has nothing to
    // check out — Stripe rejects a unit_amount of 0 (surfacing as a raw
    // 500) and the manual path would record a phantom ৳0 PENDING payment
    // that activates nothing. Refuse before any gateway call or DB record.
    if (amountUSD <= 0 && amountBDT <= 0) {
      return NextResponse.json(
        { error: 'This plan is free — no checkout required' },
        { status: 400 },
      );
    }

    const providerKey = String(provider || 'stripe').toLowerCase();
    const baseKey = providerKey.split('_')[0];
    const dbGateway = await prisma.paymentGatewayConfig.findFirst({
      where: {
        OR: [
          { gatewayKey: provider },
          { gatewayKey: providerKey },
          { gatewayKey: { contains: baseKey } },
        ],
      },
    });

    // B9-19: a gateway the admin disabled must not accept new payments,
    // even when the caller names it directly (the checkout UI filters
    // disabled gateways out; mirror that server-side). A missing config
    // row keeps the existing env-fallback behaviour (notably Stripe).
    if (dbGateway && dbGateway.isEnabled === false) {
      return NextResponse.json({ error: 'gateway_unavailable' }, { status: 400 });
    }

    const isStripe = providerKey.includes('stripe');
    const isManual =
      dbGateway?.isManual ??
      (providerKey.includes('bkash') ||
        providerKey.includes('nagad') ||
        providerKey.includes('rocket') ||
        providerKey.includes('bank') ||
        providerKey.includes('manual'));

    if (currency === 'USD' && isStripe) {
      // Same zero-amount guard for a plan priced 0 in USD only.
      if (amountUSD <= 0) {
        return NextResponse.json(
          { error: 'This plan is free — no checkout required' },
          { status: 400 },
        );
      }
      const stripe = await getStripe();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: productName },
              unit_amount: Math.round(amountUSD * 100),
            },
            quantity: 1,
          },
        ],
        metadata: { userId: user.id, type, planId: planId || '', packageId: packageId || '' },
        success_url: `${appUrl}/dashboard/billing?success=1`,
        cancel_url: `${appUrl}/pricing?canceled=1`,
      });

      const payment = await prisma.payment.create({
        data: {
          id: createId(),
          userId: user.id,
          method: 'STRIPE',
          amountUSD,
          amountBDT: 0,
          status: 'PENDING',
          transactionRef: session.id,
          planIdOrCreditPackageId: planId || packageId || null,
          gatewayPayload: { ...payload, sessionId: session.id, provider } as any,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        ok: true,
        approvalUrl: session.url,
        payment: { id: payment.id, status: payment.status },
      });
    }

    if (isManual) {
      if (!senderNumber || !transactionRef) {
        return NextResponse.json(
          { error: 'sender_number_and_transaction_ref_required' },
          { status: 400 },
        );
      }

      const method = paymentMethodFromGateway(provider);
      const publicGw = dbGateway ? toPublicGateway(dbGateway) : null;
      const finalAmountBDT = currency === 'BDT' ? Math.round(amountBDT) : 0;
      const finalAmountUSD = currency === 'USD' ? amountUSD : 0;

      // Zero-amount guard for the selected currency — never record a
      // phantom ৳0/$0 manual payment (see the check above).
      if (finalAmountBDT <= 0 && finalAmountUSD <= 0) {
        return NextResponse.json(
          { error: 'This plan is free — no checkout required' },
          { status: 400 },
        );
      }

      // H4: duplicate check + insert run inside ONE Serializable
      // transaction, so two concurrent submissions carrying the same
      // bKash/Nagad TrxID cannot both pass the check and create two
      // PENDING rows (double-approval would double-grant). The unique
      // index on transactionRef (created by db-sync after dedupe) is the
      // hard backstop: a genuine duplicate resolves via the in-transaction
      // existence check or a P2002 unique violation.
      //
      // R7-04: P2034 is a serialization/write conflict, NOT proof of a
      // duplicate — under Serializable isolation two concurrent
      // submissions (even with different TrxIDs) can abort each other.
      // The transaction is retried up to 3 attempts with jittered
      // backoff; each fresh attempt re-runs the existence check, so a
      // true duplicate still lands on the duplicate path while a
      // transient conflict succeeds on retry. A conflict that survives
      // every attempt returns a retryable 503 — never a false
      // "duplicate_transaction_ref" to a legit payer.
      const trimmedRef = transactionRef.trim();
      type CreateOutcome =
        | { kind: 'created'; id: string; status: string }
        | { kind: 'duplicate' };

      const attemptCreate = (): Promise<CreateOutcome> =>
        prisma.$transaction(
          async (tx): Promise<CreateOutcome> => {
            const existingRef = await tx.payment.findFirst({
              where: {
                method,
                transactionRef: trimmedRef,
                status: { not: 'REJECTED' },
              },
              select: { id: true },
            });
            if (existingRef) return { kind: 'duplicate' };

            const payment = await tx.payment.create({
              data: {
                id: createId(),
                userId: user.id,
                method,
                amountUSD: finalAmountUSD,
                amountBDT: finalAmountBDT,
                status: 'PENDING',
                transactionRef: trimmedRef,
                planIdOrCreditPackageId: planId || packageId || null,
                gatewayPayload: {
                  ...payload,
                  senderNumber: senderNumber.trim(),
                  provider,
                  providerDisplayName: dbGateway?.displayName || provider,
                  accountType: publicGw?.accountType,
                  currency,
                } as any,
                updatedAt: new Date(),
              },
            });
            return { kind: 'created', id: payment.id, status: payment.status };
          },
          { isolationLevel: 'Serializable' },
        );

      const MAX_TX_ATTEMPTS = 3;
      let outcome: CreateOutcome | null = null;
      for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
        try {
          outcome = await attemptCreate();
          break;
        } catch (e: any) {
          if (e?.code === 'P2002') {
            // Unique-index violation: the TrxID is genuinely taken.
            outcome = { kind: 'duplicate' };
            break;
          }
          if (e?.code === 'P2034' && attempt < MAX_TX_ATTEMPTS) {
            await new Promise((resolve) =>
              setTimeout(resolve, 60 * attempt + Math.floor(Math.random() * 90)),
            );
            continue;
          }
          if (e?.code === 'P2034') {
            return NextResponse.json(
              { error: 'payment_busy_please_retry' },
              { status: 503 },
            );
          }
          throw e;
        }
      }
      if (!outcome) throw new Error('payment_create_unreachable');

      if (outcome.kind === 'duplicate') {
        return NextResponse.json({ error: 'duplicate_transaction_ref' }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        payment: { id: outcome.id, status: outcome.status },
        instructions:
          publicGw?.instructions ||
          'Your payment was submitted successfully. Our team will verify and activate your service shortly.',
      });
    }

    return NextResponse.json({ error: 'unsupported_provider_or_currency' }, { status: 400 });
  } catch (e: any) {
    console.error('Payment creation failed:', e);
    // M-B1: never leak raw internals (Prisma/Stripe messages) to the client.
    if (e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
    }
    return NextResponse.json({ error: 'payment_creation_failed' }, { status: 500 });
  }
}

