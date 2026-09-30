import { prisma } from '@/lib/db';
import { listGatewayConfigsAdmin } from '@/lib/payments/config';
import { PaymentsClient } from '@/components/admin/payments-client';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const [payments, gateways, plans, packages, users] = await Promise.all([
    prisma.payment.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    listGatewayConfigsAdmin().catch(() => []),
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.creditPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
      take: 200,
    }),
  ]);

  return (
    <PaymentsClient
      initialPayments={payments}
      initialGateways={gateways}
      plans={plans}
      packages={packages}
      users={users}
    />
  );
}

