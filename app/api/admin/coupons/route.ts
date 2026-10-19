import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateCouponSchema = z.object({
  code: z.string().trim().min(3).max(32).toUpperCase(),
  creditsAmount: z.coerce.number().int().positive().max(100000),
  maxUses: z.coerce.number().int().positive().max(1000000).default(1),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

/** GET /api/admin/coupons — list all coupons. */
export async function GET(req: Request) {
  try {
    await requireApiAdmin(req);
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ coupons });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED' || e?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    console.error('admin coupons list failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** POST /api/admin/coupons — create a coupon. */
export async function POST(req: Request) {
  try {
    const admin = await requireApiAdmin(req);
    const body = await req.json();
    const validated = CreateCouponSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: validated.error.issues },
        { status: 400 },
      );
    }
    const { code, creditsAmount, maxUses, expiresAt, isActive } = validated.data;
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: 'code_exists' }, { status: 409 });
    }
    const coupon = await prisma.coupon.create({
      data: {
        code,
        creditsAmount,
        maxUses,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive,
        createdById: admin.id,
      },
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED' || e?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    console.error('admin coupon create failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** DELETE /api/admin/coupons?id=... — deactivate a coupon. */
export async function DELETE(req: Request) {
  try {
    await requireApiAdmin(req);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    await prisma.coupon.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED' || e?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    console.error('admin coupon delete failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
