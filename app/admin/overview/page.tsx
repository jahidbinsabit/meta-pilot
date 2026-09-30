import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AdminOverview } from '@/components/admin/admin-overview';

export default async function AdminOverviewPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== 'ADMIN') redirect('/dashboard');

  const [users, orders, jobs, providers] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.job.count(),
    prisma.aiProviderConfig.findMany(),
  ]);
  const revenue = await prisma.order.aggregate({
    _sum: { amountCents: true },
    where: { status: 'PAID' },
  });
  return (
    <AdminOverview
      users={users}
      orders={orders}
      jobs={jobs}
      providers={providers.length}
      revenue={revenue._sum.amountCents || 0}
    />
  );
}
