import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { paymentMethodFromGateway, toPublicGateway } from '@/lib/payments/public';
import { getStripe } from '@/lib/payments/stripe';
import { createId } from '@/lib/id';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = await req.json();
    const {
      type = 'credits',
      planId,
      packageId,
      currency = 'USD',
      provider = 'stripe',
      senderNumber,
      transactionRef,
      amountCents,
      credits,
    } = body;

    if (type === 'plan' && !planId) {
      return NextResponse.json({ error: 'plan_id_required' }, { status: 400 });
    }

    let amountUSD = 0;
    let amountBDT = 0;
    let payload: Record<string, unknown> = { type };
    let productName = 'StockForge purchase';

    if (type === 'plan') {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 400 });
      amountUSD = plan.monthlyPriceUSD;
      amountBDT = plan.monthlyPriceBDT;
      productName = `StockForge ${plan.name} plan`;
      payload = { type: 'plan', planId, planName: plan.name, credits: plan.creditsIncluded };
    } else if (packageId) {
      const pkg = await prisma.creditPackage.findUnique({ where: { id: packageId } });
      if (!pkg) return NextResponse.json({ error: 'package_not_found' }, { status: 400 });
      amountUSD = pkg.priceUSD;
      amountBDT = pkg.priceBDT;
      productName = `${pkg.credits} StockForge credits`;
      payload = { type: 'credits', packageId, packageName: pkg.name, credits: pkg.credits };
    } else if (amountCents && credits) {
      amountUSD = amountCents / 100;
      productName = `${credits} StockForge credits`;
      payload = { type: 'credits', credits };
    } else {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const providerKey = String(provider || 'stripe').toLowerCase();
    const dbGateway = await prisma.paymentGatewayConfig.findFirst({
      where: { OR: [{ gatewayKey: provider }, { gatewayKey: providerKey }] },
    });

    const isStripe = providerKey.includes('stripe');
    const isManual =
      dbGateway?.isManual ??
      (providerKey.includes('bkash') ||
        providerKey.includes('nagad') ||
        providerKey.includes('rocket') ||
        providerKey.includes('bank') ||
        providerKey.includes('manual'));

    if (currency === 'USD' && isStripe) {
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

      const payment = await prisma.payment.create({
        data: {
          id: createId(),
          userId: user.id,
          method,
          amountUSD: finalAmountUSD,
          amountBDT: finalAmountBDT,
          status: 'PENDING',
          transactionRef: transactionRef.trim(),
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

      return NextResponse.json({
        ok: true,
        payment: { id: payment.id, status: payment.status },
        instructions:
          publicGw?.instructions ||
          'Your payment was submitted successfully. Our team will verify and activate your service shortly.',
      });
    }

    return NextResponse.json({ error: 'unsupported_provider_or_currency' }, { status: 400 });
  } catch (e: any) {
    console.error('Payment creation failed:', e);
    const message = e.message === 'UNAUTHORIZED' ? 'Please sign in to continue' : e.message;
    const status = e.message === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

