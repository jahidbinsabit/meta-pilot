import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/dashboard/app-shell';
import { getSiteSettings } from '@/lib/site-settings';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const [user, siteSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        creditWallet: true,
        memberships: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    }),
    getSiteSettings(),
  ]);

  if (!user) redirect('/login');

  // Determine active plan tier and display name
  const activePlanTier =
    user.memberships[0]?.plan?.tier ||
    user.membership ||
    'FREE';

  const activePlanName =
    user.memberships[0]?.plan?.name ||
    (activePlanTier ? activePlanTier.charAt(0) + activePlanTier.slice(1).toLowerCase() : 'Free');

  // Keep user.membership enum in sync if active membership exists but User.membership drifted
  if (user.memberships[0]?.plan?.tier && user.membership !== user.memberships[0].plan.tier) {
    prisma.user
      .update({
        where: { id: user.id },
        data: { membership: user.memberships[0].plan.tier as any },
      })
      .catch(() => {});
  }

  // Ensure CreditWallet exists and is synchronized with User.credits
  let displayCredits = user.credits;
  let wallet = user.creditWallet;

  if (!wallet) {
    try {
      const trialRaw = process.env.TRIAL_CREDITS;
      const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
      const initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;

      wallet = await prisma.creditWallet.create({
        data: { userId: user.id, balance: initialCredits },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: initialCredits },
      });
      if (initialCredits > 0) {
        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: initialCredits,
            type: 'BONUS',
            reason: 'welcome_trial',
          },
        });
      }
      displayCredits = initialCredits;
    } catch (err) {
      console.error('Failed to init wallet credits in dashboard layout:', err);
    }
  } else if (wallet.balance !== user.credits) {
    displayCredits = wallet.balance;
    prisma.user
      .update({
        where: { id: user.id },
        data: { credits: wallet.balance },
      })
      .catch(() => {});
  } else {
    displayCredits = wallet.balance;
  }

  const rawTier = String(activePlanTier || 'FREE').toUpperCase();
  const validAudiences = ['FREE', 'PRO', 'PLUS', 'AGENCY', 'ENTERPRISE'];
  const audienceFilter = validAudiences.includes(rawTier) ? rawTier : 'FREE';

  const notifications = await prisma.notification.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        { OR: [{ audience: 'ALL' }, { audience: audienceFilter as any }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      body: true,
      ctaLabel: true,
      ctaUrl: true,
    },
  });

  const siteName = siteSettings?.siteName || 'StockForge AI';

  return (
    <AppShell
      siteName={siteName}
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        credits: displayCredits,
        membership: activePlanName,
        role: user.role,
      }}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
