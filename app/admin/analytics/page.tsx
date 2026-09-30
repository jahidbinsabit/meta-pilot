import { prisma } from '@/lib/db';
import { AnalyticsClient } from '@/components/admin/analytics-client';

export default async function AnalyticsPage() {
  const [users, orders, jobs, gens] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.job.count(),
    prisma.generatedMetadata.count(),
  ]);
  const revenue = await prisma.order.aggregate({
    _sum: { amountCents: true },
    where: { status: 'PAID' },
  });
  return (
    <AnalyticsClient
      stats={{ users, orders, jobs, gens, revenue: revenue._sum.amountCents || 0 }}
    />
  );
}
