import { prisma } from '@/lib/db';
import { listGatewayConfigsAdmin, maskCredentials } from '@/lib/payments/config';
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
    // T4-30: listGatewayConfigsAdmin returns DECRYPTED credentials — mask
    // them before they are serialised into the client props, exactly like
    // the gateways API does. The browser must only ever hold ••••last4.
    listGatewayConfigsAdmin()
      .then((gateways) =>
        gateways.map((g) => ({ ...g, credentials: maskCredentials(g.credentials) })),
      )
      .catch(() => []),
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

