import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AdminOverview } from '@/components/admin/admin-overview';
import {
  BUSINESS_TIME_ZONE,
  countJobImages,
  dayKeyInTimeZone,
  startOfDayInTimeZone,
} from '@/lib/generation-stats';

const CHART_DAYS = 7;

export default async function AdminOverviewPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== 'ADMIN') redirect('/dashboard');

  // Generation stats count IMAGES produced (completed per-image
  // results), not ToolJob rows — one batch job can carry 100 images —
  // and days follow the owner's business timezone (Asia/Dhaka), not
  // UTC. See lib/generation-stats.ts. (The analytics page still uses
  // UTC job counts; aligning it is a separate change.)
  const startOfToday = startOfDayInTimeZone(BUSINESS_TIME_ZONE);
  const chartSince = new Date(startOfToday.getTime() - (CHART_DAYS - 1) * 86_400_000);

  const [users, orders, jobs, providers, recentJobs] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count({ where: { status: 'COMPLETED' } }),
    // "Jobs queued" — ToolJob is the canonical job entity (legacy `Job` table is write-dead).
    prisma.toolJob.count({ where: { status: 'QUEUED' } }),
    // T4-55: only ENABLED providers count as "active" (disabled rows were
    // included before, inflating the stat).
    prisma.aiProviderConfig.findMany({ where: { enabled: true } }),
    prisma.toolJob.findMany({
      where: { createdAt: { gte: chartSince } },
      select: { createdAt: true, toolSlug: true, status: true, outputData: true, inputFileUrls: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  // M-B6: `Order` is write-dead — read the live `Payment` model instead.
  const revenue = await prisma.payment.aggregate({
    _sum: { amountUSD: true },
    where: { status: 'COMPLETED' },
  });

  // Fill missing days with 0 so the chart is continuous.
  const dayMap = new Map<string, number>();
  for (let i = 0; i < CHART_DAYS; i++) {
    dayMap.set(dayKeyInTimeZone(BUSINESS_TIME_ZONE, new Date(chartSince.getTime() + i * 86_400_000)), 0);
  }
  let todayGens = 0;
  for (const job of recentJobs) {
    const images = countJobImages(job);
    if (images === 0) continue;
    const key = dayKeyInTimeZone(BUSINESS_TIME_ZONE, job.createdAt);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + images);
    if (job.createdAt >= startOfToday) todayGens += images;
  }
  const daily = [...dayMap.entries()].map(([day, count]) => ({
    day: day.slice(5), // MM-DD
    fullDay: day,
    generations: count,
  }));

  return (
    <AdminOverview
      users={users}
      orders={orders}
      jobs={jobs}
      providers={providers.length}
      providerNames={providers.map((p) => p.provider)}
      revenue={Math.round((revenue._sum.amountUSD || 0) * 100)}
      todayGens={todayGens}
      dailyGens={daily}
      chartDays={CHART_DAYS}
    />
  );
}
