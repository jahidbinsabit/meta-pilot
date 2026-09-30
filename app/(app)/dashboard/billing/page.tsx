import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import getServerSession from '@/lib/server-session';
import { buildCheckoutGateways } from '@/lib/payments/public';
import { BillingCheckout } from '@/components/dashboard/billing-checkout';

export default async function BillingPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { creditWallet: true },
  });
  if (!user) redirect('/login');

  // Fetch active plans
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Fetch active credit packages
  const packages = await prisma.creditPackage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Fetch payment gateways
  const rawGateways = await prisma.paymentGatewayConfig.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  const gateways = buildCheckoutGateways(rawGateways);

  // Get user's current membership
  let membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      status: 'ACTIVE',
    },
    include: { plan: true },
    orderBy: { startedAt: 'desc' },
  });

  // If user has a membership enum (e.g. PRO) but no Membership row, try finding the corresponding Plan
  if (!membership && user.membership && user.membership !== 'FREE') {
    const plan = await prisma.plan.findFirst({
      where: { tier: user.membership as any, isActive: true },
    });
    if (plan) {
      membership = {
        id: 'virtual',
        userId: user.id,
        planId: plan.id,
        status: 'ACTIVE',
        startedAt: user.createdAt,
        renewsAt: null,
        cancelAtPeriodEnd: false,
        plan,
      } as any;
    }
  }

  // Get recent payments
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Get recent credit transactions
  const transactions = await prisma.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const walletBalance = user.creditWallet?.balance ?? 0;

  return (
    <BillingCheckout
      plans={plans}
      packages={packages}
      gateways={gateways}
      currentMembership={membership}
      walletBalance={walletBalance}
      payments={payments}
      transactions={transactions}
      userId={user.id}
    />
  );
}

