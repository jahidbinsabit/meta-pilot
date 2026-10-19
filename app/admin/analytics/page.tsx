import { prisma } from '@/lib/db';
import { AnalyticsClient } from '@/components/admin/analytics-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

const DAYS = 14;

export default async function AnalyticsPage() {
  // Use UTC midnight consistently: the DB stores timestamptz and to_char()
  // formats in the DB session timezone, so pin everything to UTC to avoid
  // day-boundary skew between the stat cards and the chart buckets.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (DAYS - 1));

  // Stat cards count the SAME canonical entity the charts count: ToolJob.
  // (The legacy `Job` table is write-dead and `GeneratedMetadata` only covers
  // completed metadata rows, which is why the cards read 0 while charts show data.)
  const [users, orders, jobs, gens, revenue, dailyJobs, toolBreakdown, userDaily] =
    await Promise.all([
      prisma.user.count(),
      prisma.payment.count({ where: { status: 'COMPLETED' } }),
      prisma.toolJob.count(),
      prisma.toolJob.count({ where: { createdAt: { gte: since } } }),
      // M-B6: `Order` is write-dead (live flow writes `Payment` only).
      // Sum completed payment USD → cents for the existing display.
      prisma.payment.aggregate({
        _sum: { amountUSD: true },
        where: { status: 'COMPLETED' },
      }),
      // Daily generation counts (ToolJob) for the last N days.
      // Indexed on createdAt — cheap aggregation.
      prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM "ToolJob"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      // Per-tool breakdown for the period.
      prisma.toolJob.groupBy({
        by: ['toolSlug'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
        orderBy: { _count: { toolSlug: 'desc' } },
      }),
      // Per-user daily generations (top 50 rows) for the period.
      // Indexed on (userId, createdAt) — cheap.
      prisma.$queryRaw<{ day: string; userId: string; name: string | null; email: string; count: bigint }[]>`
        SELECT to_char(t."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, t."userId" AS "userId",
               u."name" AS name, u."email" AS email, COUNT(*) AS count
        FROM "ToolJob" t
        JOIN "User" u ON u."id" = t."userId"
        WHERE t."createdAt" >= ${since}
        GROUP BY 1, 2, 3, 4
        ORDER BY 1 DESC, 5 DESC
        LIMIT 200
      `,
    ]);

  // Fill missing days with 0 so the chart is continuous.
  const dayMap = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of dailyJobs) {
    dayMap.set(row.day, Number(row.count));
  }
  const daily = [...dayMap.entries()].map(([day, count]) => ({
    day: day.slice(5), // MM-DD
    fullDay: day,
    generations: count,
  }));

  return (
    <AnalyticsClient
      stats={{ users, orders, jobs, gens, revenue: Math.round((revenue._sum.amountUSD || 0) * 100) }}
      daily={daily}
      tools={toolBreakdown.map((t) => ({ tool: t.toolSlug, count: t._count._all }))}
      userDaily={userDaily.map((r) => ({
        day: r.day,
        userId: r.userId,
        name: r.name || r.email,
        email: r.email,
        count: Number(r.count),
      }))}
      days={DAYS}
    />
  );
}
