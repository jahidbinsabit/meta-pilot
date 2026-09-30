import { prisma } from '@/lib/db';
import { SettingsClient } from '@/components/admin/settings-client';

export default async function AdminSettingsPage() {
  const users = await prisma.user.count();
  const paid = await prisma.order.count({ where: { status: 'PAID' } });
  const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
  return <SettingsClient users={users} paidOrders={paid} initialSettings={settings} />;
}
