import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { PlanTier } from '@prisma/client';

const createSchema = z.object({
  tier: z.enum(['FREE', 'PRO', 'PLUS', 'AGENCY']),
  name: z.string().min(1),
  monthlyPriceUSD: z.number().min(0),
  monthlyPriceBDT: z.number().int().min(0),
  creditsIncluded: z.number().int().min(0),
  dailyFreeCredits: z.number().int().min(0),
  adobeAnalyticsResultLimit: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  await requireApiAdmin();

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json(plans);
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const plan = await prisma.$transaction(async (tx) => {
    // Check if tier already exists
    const existing = await tx.plan.findUnique({ where: { tier: data.tier as PlanTier } });
    if (existing) {
      throw new Error('PLAN_EXISTS');
    }

    return tx.plan.create({ data });
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'CREATE',
      targetType: 'Plan',
      targetId: plan.id,
      after: data,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
