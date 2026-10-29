import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { grantBonus } from '@/lib/credits/engine';

/** Constant-time secret comparison (mirrors cleanup-uploads; T5-09 —
 * this route used plain === while its sibling cron used timingSafeEqual). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Daily free-credits cron.
 *
 * Authored via a shared CRON_SECRET so external schedulers (Vercel Cron,
 * a systemd timer, GitHub Actions) can trigger it. The grant only applies to
 * users whose membership includes a daily allowance and who have not yet
 * received theirs today (UTC).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  // Fail CLOSED: if no CRON_SECRET is configured, deny all requests.
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const validBearer = secretMatches(bearerToken, expectedSecret);
  const validHeader = secretMatches(cronSecret, expectedSecret);
  if (!validBearer && !validHeader) {
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

  const plans = await prisma.plan.findMany();
  const dailyByTier = new Map(plans.map((p) => [p.tier, p.dailyFreeCredits]));

  // Process users in batches of 100 — never load the whole table into memory.
  // Each user's grant is wrapped in try/catch so one failure can't abort the
  // entire run for the remaining users.
  const BATCH = 100;
  let cursor: string | undefined;
  let granted = 0;
  let failed = 0;
  let total = 0;

  for (;;) {
    const batch: Array<{ id: string; membership: string }> = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, membership: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    total += batch.length;

    for (const u of batch) {
      if (grantedSet.has(u.id)) continue;
      const daily = dailyByTier.get(u.membership as any) ?? 0;
      if (daily <= 0) continue;
      try {
        const result = await grantBonus(u.id, daily, 'daily_free');
        // grantBonus is idempotent via lastDailyGrantAt — only count actual grants.
        if (result.granted) granted++;
      } catch (e) {
        failed++;
        console.error(`[daily-credits] grant failed for user ${u.id}:`, e);
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;
  }

  return NextResponse.json({ ok: true, granted, failed, total });
}
