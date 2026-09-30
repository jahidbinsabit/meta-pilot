import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

/**
 * GET  -> all plans with their Adobe Analytics row limit
 * PUT  -> update one plan's `adobeAnalyticsResultLimit`
 *
 * This is the "limit per tier configurable from the admin panel" hook
 * (PROMPT 6.3). Editing it takes effect on the next search — no redeploy,
 * because the cap is read from the Plan row at request time.
 */

const MAX_LIMIT = 100_000;

const updateSchema = z.object({
  tier: z.enum(['FREE', 'PRO', 'PLUS', 'AGENCY']),
  // -1 = unlimited, 0 = "not configured" (falls back to 20 on free), >0 = cap
  adobeAnalyticsResultLimit: z
    .number()
    .int()
    .min(-1, 'Use -1 for unlimited')
    .max(MAX_LIMIT, `Maximum ${MAX_LIMIT.toLocaleString()}`),
});

export async function GET() {
  try {
    await requireApiAdmin();
  } catch (e: any) {
    const status = e.message === 'FORBIDDEN' ? 403 : 401;
    return NextResponse.json({ error: e.message || 'unauthorized' }, { status });
  }

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      tier: true,
      adobeAnalyticsResultLimit: true,
      isActive: true,
    },
  });

  const userCounts = await prisma.user.groupBy({
    by: ['membership'],
    _count: { _all: true },
  });

  return NextResponse.json({ plans, userCounts });
}

export async function PUT(req: Request) {
  let admin;
  try {
    admin = await requireApiAdmin();
  } catch (e: any) {
    const status = e.message === 'FORBIDDEN' ? 403 : 401;
    return NextResponse.json({ error: e.message || 'unauthorized' }, { status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { tier, adobeAnalyticsResultLimit } = parsed.data;

  const before = await prisma.plan.findUnique({ where: { tier } });
  if (!before) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const plan = await prisma.plan.update({
    where: { tier },
    data: { adobeAnalyticsResultLimit },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: 'plan.adobe_analytics_limit.update',
      targetType: 'Plan',
      targetId: plan.id,
      before: { adobeAnalyticsResultLimit: before.adobeAnalyticsResultLimit } as any,
      after: { adobeAnalyticsResultLimit } as any,
    },
  });

  return NextResponse.json({
    id: plan.id,
    name: plan.name,
    tier: plan.tier,
    adobeAnalyticsResultLimit: plan.adobeAnalyticsResultLimit,
  });
}
