import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { grantBonus } from '@/lib/credits/engine';

/**
 * Daily free-credits cron.
 *
 * Authored via a shared CRON_SECRET so external schedulers (Vercel Cron,
 * a systemd timer, GitHub Actions) can trigger it. The grant only applies to
 * users whose membership includes a daily allowance and who have not yet
 * received theirs today (UTC).
 */
export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Users who already got their daily grant today.
  const alreadyGranted = await prisma.creditTransaction.findMany({
    where: { reason: 'daily_free', createdAt: { gte: today } },
    select: { userId: true },
  });
  const grantedSet = new Set(alreadyGranted.map((r) => r.userId));

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, membership: true },
  });

  const plans = await prisma.plan.findMany();
  const dailyByTier = new Map(plans.map((p) => [p.tier, p.dailyFreeCredits]));

  let granted = 0;
  for (const u of users) {
    if (grantedSet.has(u.id)) continue;
    const daily = dailyByTier.get(u.membership as any) ?? 0;
    if (daily <= 0) continue;
    await grantBonus(u.id, daily, 'daily_free');
    granted++;
  }

  return NextResponse.json({ ok: true, granted, total: users.length });
}
