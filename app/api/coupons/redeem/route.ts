import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { addCredits } from '@/lib/credits/engine';

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

    // Prevent the same user redeeming the same code twice.
    // The coupon id is stored in the transaction metadata by addCredits.
    const already = await prisma.creditTransaction.findFirst({
      where: {
        userId: user.id,
        type: 'BONUS',
        metadata: { path: ['couponId'], equals: coupon.id } as any,
      },
    });
    if (already) {
      return NextResponse.json({ error: 'already_redeemed' }, { status: 400 });
    }

    // Atomic: increment usedCount only if under maxUses.
    // Done BEFORE granting so concurrent redeems can't overshoot maxUses.
    // If the credit grant fails below, we roll the count back.
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.coupon.updateMany({
          where: { id: coupon.id, usedCount: { lt: coupon.maxUses }, isActive: true },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.count === 0) {
          throw new Error('code_exhausted');
        }
      });
    } catch (e: any) {
      if (e?.message === 'code_exhausted') {
        return NextResponse.json({ error: 'code_exhausted' }, { status: 400 });
      }
      throw e;
    }

    let grant;
    try {
      grant = await addCredits(user.id, coupon.creditsAmount, 'BONUS', {
        couponId: coupon.id,
        code: coupon.code,
      });
    } catch (grantErr) {
      // Roll back the usedCount so the coupon isn't burned on a failed grant.
      await prisma.coupon.updateMany({
        where: { id: coupon.id },
        data: { usedCount: { decrement: 1 } },
      });
      throw grantErr;
    }

    return NextResponse.json({
      ok: true,
      credits: coupon.creditsAmount,
      balance: grant.balance,
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (e?.message === 'code_exhausted') {
      return NextResponse.json({ error: 'code_exhausted' }, { status: 400 });
    }
    console.error('coupon redeem failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
