import { prisma } from '@/lib/db';
import { SettingsClient } from '@/components/admin/settings-client';
import { ensureDatabaseSchema } from '@/lib/db-sync';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await ensureDatabaseSchema().catch(() => {});

  let users = 0;
  let paid = 0;
  let settings = null;

  try {
    const [u, p, s] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.order.count({ where: { status: 'PAID' } }).catch(() => 0),
      prisma.siteSettings.findUnique({ where: { id: 'default' } }).catch(() => null),
    ]);
    users = u;
    paid = p;
    settings = s;
  } catch (err) {
    console.error('[AdminSettingsPage] Error fetching settings:', err);
  }

  return <SettingsClient users={users} paidOrders={paid} initialSettings={settings} />;
}

