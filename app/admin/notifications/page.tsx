import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import getServerSession from '@/lib/server-session';
import { NotificationsClient } from '@/components/admin/notifications-client';

export default async function NotificationsPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== 'ADMIN') redirect('/dashboard');

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <NotificationsClient
      initialNotifications={notifications.map((notification) => ({
        ...notification,
        audience: notification.audience,
        ctaLabel: notification.ctaLabel ?? null,
        ctaUrl: notification.ctaUrl ?? null,
        startsAt: notification.startsAt ? notification.startsAt.toISOString() : null,
        endsAt: notification.endsAt ? notification.endsAt.toISOString() : null,
        createdAt: notification.createdAt.toISOString(),
        updatedAt: notification.updatedAt.toISOString(),
      }))}
    />
  );
}
