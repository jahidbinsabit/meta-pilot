import { prisma } from '@/lib/db';
import { UsersClient } from '@/components/admin/users-client';
import { ensureDatabaseSchema } from '@/lib/db-sync';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await ensureDatabaseSchema().catch(() => {});

  try {
    const [plans, stats, initialUsers, total] = await Promise.all([
      prisma.plan.findMany({
        orderBy: { sortOrder: 'asc' },
      }).catch(() => []),
      prisma.$transaction(async (tx) => {
        const [totalUsers, activeUsers, suspendedUsers, adminUsers, paidUsers] = await Promise.all([
          tx.user.count().catch(() => 0),
          tx.user.count({ where: { status: 'ACTIVE', deletedAt: null } }).catch(() => 0),
          tx.user.count({ where: { status: 'SUSPENDED' } }).catch(() => 0),
          tx.user.count({ where: { role: 'ADMIN' } }).catch(() => 0),
          tx.user.count({ where: { membership: { not: 'FREE' } } }).catch(() => 0),
        ]);
        return { totalUsers, activeUsers, suspendedUsers, adminUsers, paidUsers };
      }).catch(() => ({ totalUsers: 0, activeUsers: 0, suspendedUsers: 0, adminUsers: 0, paidUsers: 0 })),
      prisma.user.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: {
          creditWallet: true,
          memberships: {
            where: { status: 'ACTIVE' },
            include: { plan: true },
            take: 1,
          },
          _count: {
            select: {
              creditTransactions: true,
              toolJobs: true,
            },
          },
        },
      }).catch(() => []),
      prisma.user.count().catch(() => 0),
    ]);

    const sanitizedInitialUsers = initialUsers.map((u: any) => ({
      ...u,
      hasGeminiKey: !!(u.geminiApiKey && typeof u.geminiApiKey === 'string' && u.geminiApiKey.trim()),
      hasOpenaiKey: !!(u.openaiApiKey && typeof u.openaiApiKey === 'string' && u.openaiApiKey.trim()),
      hasGrokKey: !!(u.grokApiKey && typeof u.grokApiKey === 'string' && u.grokApiKey.trim()),
      geminiApiKey: undefined,
      openaiApiKey: undefined,
      grokApiKey: undefined,
    }));

    return (
      <UsersClient
        initialUsers={sanitizedInitialUsers}
        initialTotal={total}
        initialStats={stats}
        plans={plans}
      />
    );
  } catch (err) {
    console.error('[UsersPage] Error loading users:', err);
    return (
      <UsersClient
        initialUsers={[]}
        initialTotal={0}
        initialStats={{ totalUsers: 0, activeUsers: 0, suspendedUsers: 0, adminUsers: 0, paidUsers: 0 }}
        plans={[]}
      />
    );
  }
}

