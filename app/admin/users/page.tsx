import { prisma } from '@/lib/db';
import { UsersClient } from '@/components/admin/users-client';

export default async function UsersPage() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return <UsersClient users={users} />;
}
