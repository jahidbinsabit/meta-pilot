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

  const notifications = await prisma.notification.findMany({
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
  });

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        credits: user.credits,
        membership: activePlanName,
        role: user.role,
      }}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
