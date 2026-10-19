import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RedeemSchema = z.object({
  code: z.string().trim().min(1).max(32).toUpperCase(),
});

/**
 * POST /api/coupons/redeem — redeem a promo code for credits.
 * Idempotent per user+code via a CreditTransaction lookup (prevents double-redeem).
 */
export async function POST(req: Request) {
  // M3: rate limit — 10 redeem attempts per minute per IP, so coupon
  // codes can't be brute-forced. Mirrors account/verify-email.
  const limited = rateLimitResponse(req, { max: 10, windowMs: 60_000, scope: 'coupon-redeem' });
  if (limited) return limited;

  try {
    const user = await requireApiUser(req);
    const body = await req.json();
    const validated = RedeemSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { code } = validated.data;

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return NextResponse.json({ error: 'expired_code' }, { status: 400 });
    }
    if (coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'code_exhausted' }, { status: 400 });
    }

    // Everything below runs in ONE transaction: the per-user idempotency
    // check, the atomic usedCount increment, and the credit grant. Splitting
    // them across separate transactions let two concurrent redeems both pass
    // the check and double-grant — that was the double-redeem race.
    const result = await prisma.$transaction(async (tx) => {
      // Per-user idempotency: the coupon id is stored in transaction metadata.
      const already = await tx.creditTransaction.findFirst({
        where: {
          userId: user.id,
          type: 'BONUS',
          metadata: { path: ['couponId'], equals: coupon.id } as any,
        },
      });
      if (already) throw new Error('already_redeemed');

      // Atomic: increment usedCount only if under maxUses. The conditional
      // update takes the coupon row's write lock, so concurrent redeems
      // can't overshoot maxUses.
      const updated = await tx.coupon.updateMany({
        where: { id: coupon.id, usedCount: { lt: coupon.maxUses }, isActive: true },
        data: { usedCount: { increment: 1 } },
      });
      if (updated.count === 0) throw new Error('code_exhausted');

      // Grant the credits inline (same tx) — no separate addCredits call,
      // so a grant can never land without the checks above passing.
      const wallet = await tx.creditWallet.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, balance: 0 },
      });
      const next = wallet.balance + coupon.creditsAmount;
      await tx.creditWallet.update({ where: { userId: user.id }, data: { balance: next } });
      await tx.user.update({ where: { id: user.id }, data: { credits: next } });
      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          amount: coupon.creditsAmount,
          type: 'BONUS',
          metadata: { couponId: coupon.id, code: coupon.code } as any,
        },
      });
      return { balance: next };
    });

    return NextResponse.json({
      ok: true,
      credits: coupon.creditsAmount,
      balance: result.balance,
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (e?.message === 'code_exhausted') {
      return NextResponse.json({ error: 'code_exhausted' }, { status: 400 });
    }
    if (e?.message === 'already_redeemed') {
      return NextResponse.json({ error: 'already_redeemed' }, { status: 400 });
    }
    console.error('coupon redeem failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
