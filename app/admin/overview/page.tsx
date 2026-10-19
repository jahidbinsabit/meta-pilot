import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AdminOverview } from '@/components/admin/admin-overview';

const CHART_DAYS = 7;

export default async function AdminOverviewPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== 'ADMIN') redirect('/dashboard');

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const chartSince = new Date();
  chartSince.setDate(chartSince.getDate() - (CHART_DAYS - 1));
  chartSince.setHours(0, 0, 0, 0);

  const [users, orders, jobs, providers, todayGens, dailyJobs] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.job.count(),
    prisma.aiProviderConfig.findMany(),
    // Today's generation count — indexed on createdAt.
    prisma.toolJob.count({ where: { createdAt: { gte: startOfToday } } }),
    // Last N days daily counts for the mini chart.
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, COUNT(*) AS count
      FROM "ToolJob"
      WHERE "createdAt" >= ${chartSince}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);
  const revenue = await prisma.order.aggregate({
    _sum: { amountCents: true },
    where: { status: 'PAID' },
  });

  // Fill missing days with 0 so the chart is continuous.
  const dayMap = new Map<string, number>();
  for (let i = 0; i < CHART_DAYS; i++) {
    const d = new Date(chartSince);
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
    <AdminOverview
      users={users}
      orders={orders}
      jobs={jobs}
      providers={providers.length}
      revenue={revenue._sum.amountCents || 0}
      todayGens={todayGens}
      dailyGens={daily}
      chartDays={CHART_DAYS}
    />
  );
}
