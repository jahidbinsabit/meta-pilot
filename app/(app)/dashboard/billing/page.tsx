import * as React from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import getServerSession from '@/lib/server-session';
import { buildCheckoutGateways } from '@/lib/payments/public';
import { isMembershipExpired, flipMembershipToExpired } from '@/lib/plans/membership';
import { getSiteSettings } from '@/lib/site-settings';
import { BillingCheckout } from '@/components/dashboard/billing-checkout';
import { RedeemCoupon } from '@/components/dashboard/redeem-coupon';

export const dynamic = 'force-dynamic';

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

  // If user has a membership enum (e.g. PRO) but no Membership row, try finding the corresponding Plan safely.
  // NOTE: 'ENTERPRISE' is a virtual tier with no Plan row and not in the PlanTier
  // enum — querying Prisma with it throws. Handle it via planFallbackName only.
  if (!membership && user.membership && user.membership !== 'FREE' && user.membership !== 'ENTERPRISE') {
    // L8: type-safe tier narrowing — no `as any` needed.
    const validTiers = ['PRO', 'PLUS', 'AGENCY'] as const;
    type ValidTier = (typeof validTiers)[number];
    const isValidTier = (t: string): t is ValidTier =>
      (validTiers as readonly string[]).includes(t);
    if (isValidTier(user.membership)) {
      const plan = await prisma.plan.findFirst({
        where: { tier: user.membership, isActive: true },
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
  }

  // B9-01: the row's real renewsAt already flows to the client with the
  // membership object — surface an explicit `expired` flag alongside it
  // (previously nothing distinguished a lapsed plan from a live one) and
  // lazily flip a lapsed row to EXPIRED so the next load, and every gate
  // resolver, sees the downgraded state. The virtual fallback row has no
  // DB row to flip.
  let membershipExpired = false;
  if (membership && membership.id !== 'virtual') {
    membershipExpired = isMembershipExpired(membership);
    if (membershipExpired) {
      await flipMembershipToExpired(membership).catch(() => false);
    }
  }
  const currentMembership = membership
    ? { ...membership, expired: membershipExpired }
    : null;

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

  // Global unlimited mode — same source the sidebar/topbar use (via
  // /api/credits), so the balance card agrees with them.
  const siteSettings = await getSiteSettings().catch(() => null);
  const unlimitedMode = siteSettings?.unlimitedMode === true;

  // Plan display name from the SAME source of truth the sidebar uses
  // (dashboard layout: active Membership → plan, else the User.membership enum).
  // Used as a fallback so the "Current Membership" card never disagrees with the sidebar.
  const planFallbackName =
    user.membership && user.membership !== 'FREE'
      ? user.membership.charAt(0) + user.membership.slice(1).toLowerCase()
      : null;

  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted"></div>
          <div className="h-4 w-72 rounded bg-muted/60"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="h-64 rounded-xl bg-card border border-border"></div>
            <div className="h-64 rounded-xl bg-card border border-border"></div>
            <div className="h-64 rounded-xl bg-card border border-border"></div>
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
        <RedeemCoupon />
        <BillingCheckout
        plans={plans}
        packages={packages}
        gateways={gateways}
        currentMembership={currentMembership}
        planFallbackName={planFallbackName}
        walletBalance={walletBalance}
        unlimitedMode={unlimitedMode}
        payments={payments}
        transactions={transactions}
        userId={user.id}
      />
      </div>
    </React.Suspense>
  );
}


