import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { AdminShell } from '@/components/admin/admin-shell';
import { getSiteSettings } from '@/lib/site-settings';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const [user, siteSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { email: session.user.email },
      select: { name: true, email: true, role: true },
    }),
    getSiteSettings(),
  ]);

  if (!user || user.role !== 'ADMIN') redirect('/dashboard');

  const siteName = siteSettings?.siteName || 'StockForge AI';

  return (
    <AdminShell
      siteName={siteName}
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {children}
    </AdminShell>
  );
}
