import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/dashboard/app-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { plan: true },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });
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
    await prisma.user
      .update({
        where: { id: user.id },
        data: { membership: user.memberships[0].plan.tier as any },
      })
      .catch(() => {});
  }

  // Ensure CreditWallet exists and is synchronized with User.credits
  let displayCredits = user.credits;
  try {
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    const trialRaw = process.env.TRIAL_CREDITS;
    const trial = trialRaw !== undefined && trialRaw !== '' ? Number(trialRaw) : 20;
    const initialCredits = isNaN(trial) || trial < 0 ? 20 : trial;

    if (!wallet) {
      await prisma.creditWallet.create({
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
    } else if (wallet.balance === 0 && user.credits === 0) {
      const txCount = await prisma.creditTransaction.count({ where: { userId: user.id } });
      if (txCount === 0 && initialCredits > 0) {
        await prisma.creditWallet.update({
          where: { userId: user.id },
          data: { balance: initialCredits },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: initialCredits },
        });
        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: initialCredits,
            type: 'BONUS',
            reason: 'welcome_trial',
          },
        });
        displayCredits = initialCredits;
      }
    } else if (wallet.balance !== user.credits) {
      displayCredits = wallet.balance;
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: wallet.balance },
      });
    }
  } catch (err) {
    console.error('Failed to sync wallet credits in dashboard layout:', err);
  }

  const [notifications, siteSettings] = await Promise.all([
    prisma.notification.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          { OR: [{ audience: 'ALL' }, { audience: activePlanTier.toUpperCase() as any }] },
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
    }),
    prisma.siteSettings.findUnique({ where: { id: 'default' } }).catch(() => null),
  ]);

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
