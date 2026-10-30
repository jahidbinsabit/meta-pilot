import { prisma } from '@/lib/db';
import { AnalyticsClient } from '@/components/admin/analytics-client';
import {
  BUSINESS_TIME_ZONE,
  countJobImages,
  dayKeyInTimeZone,
  startOfDayInTimeZone,
} from '@/lib/generation-stats';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

const DAYS = 14;

export default async function AnalyticsPage() {
  // Generation stats count IMAGES produced (completed per-image
  // results), not ToolJob rows, and days follow the owner's business
  // timezone (Asia/Dhaka) — the same rule as the admin overview; see
  // lib/generation-stats.ts. The 'Jobs' card stays a plain job count.
  const startOfToday = startOfDayInTimeZone(BUSINESS_TIME_ZONE);
  const since = new Date(startOfToday.getTime() - (DAYS - 1) * 86_400_000);

  const [users, orders, jobs, revenue, windowJobs] = await Promise.all([
    prisma.user.count(),
    // M-B6: `Order` is write-dead (live flow writes `Payment` only).
    prisma.payment.count({ where: { status: 'COMPLETED' } }),
    prisma.toolJob.count(),
    // Sum completed payment USD → cents for the existing display.
    prisma.payment.aggregate({
      _sum: { amountUSD: true },
      where: { status: 'COMPLETED' },
    }),
    prisma.toolJob.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        userId: true,
        toolSlug: true,
        status: true,
        outputData: true,
        inputFileUrls: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Fill missing days with 0 so the chart is continuous.
  const dayMap = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    dayMap.set(dayKeyInTimeZone(BUSINESS_TIME_ZONE, new Date(since.getTime() + i * 86_400_000)), 0);
  }
  const toolMap = new Map<string, number>();
  const userDayMap = new Map<string, { day: string; userId: string; count: number }>();
  let gens = 0;
  for (const job of windowJobs) {
    const images = countJobImages(job);
    if (images === 0) continue;
    gens += images;
    const key = dayKeyInTimeZone(BUSINESS_TIME_ZONE, job.createdAt);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + images);
    toolMap.set(job.toolSlug, (toolMap.get(job.toolSlug) ?? 0) + images);
    const udKey = `${key}|${job.userId}`;
    const row = userDayMap.get(udKey) ?? { day: key, userId: job.userId, count: 0 };
    row.count += images;
    userDayMap.set(udKey, row);
  }

  const daily = [...dayMap.entries()].map(([day, count]) => ({
    day: day.slice(5), // MM-DD
    fullDay: day,
    generations: count,
  }));
  const tools = [...toolMap.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  // Names/emails for the per-user table (only users who generated).
  const userIds = [...new Set([...userDayMap.values()].map((r) => r.userId))];
  const userRows = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const userDaily = [...userDayMap.values()]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.count - a.count))
    .slice(0, 200)
    .map((r) => {
      const u = userById.get(r.userId);
      return {
        day: r.day,
        userId: r.userId,
        name: u?.name || u?.email || r.userId,
        email: u?.email ?? '',
        count: r.count,
      };
    });

  return (
    <AnalyticsClient
      stats={{ users, orders, jobs, gens, revenue: Math.round((revenue._sum.amountUSD || 0) * 100) }}
      daily={daily}
      tools={tools}
      userDaily={userDaily}
      days={DAYS}
    />
  );
}
