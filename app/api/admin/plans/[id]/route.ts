import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  monthlyPriceUSD: z.number().min(0).optional(),
  monthlyPriceBDT: z.number().int().min(0).optional(),
  creditsIncluded: z.number().int().min(0).optional(),
  dailyFreeCredits: z.number().int().min(0).optional(),
  adobeAnalyticsResultLimit: z.number().int().min(-1).optional(),
  features: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireApiAdmin();
  const { id } = params;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const before = await prisma.plan.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const plan = await prisma.plan.update({
    where: { id },
    data: { ...parsed.data, updatedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'UPDATE',
      targetType: 'Plan',
      targetId: plan.id,
      before,
      after: plan,
    },
  });

  return NextResponse.json(plan);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireApiAdmin();
  const { id } = params;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  await prisma.plan.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'DELETE',
      targetType: 'Plan',
      targetId: id,
      before: plan,
    },
  });

  return NextResponse.json({ success: true });
}
