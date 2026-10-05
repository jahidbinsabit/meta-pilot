import { prisma } from '@/lib/db';
import { UsersClient } from '@/components/admin/users-client';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [plans, stats, initialUsers, total] = await Promise.all([
    prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.$transaction(async (tx) => {
      const [totalUsers, activeUsers, suspendedUsers, adminUsers, paidUsers] = await Promise.all([
        tx.user.count(),
        tx.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        tx.user.count({ where: { status: 'SUSPENDED' } }),
        tx.user.count({ where: { role: 'ADMIN' } }),
        tx.user.count({ where: { membership: { not: 'FREE' } } }),
      ]);
      return { totalUsers, activeUsers, suspendedUsers, adminUsers, paidUsers };
    }),
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
    }),
    prisma.user.count(),
  ]);

  const sanitizedInitialUsers = initialUsers.map((u) => ({
    ...u,
    hasGeminiKey: !!(u.geminiApiKey && u.geminiApiKey.trim()),
    hasOpenaiKey: !!(u.openaiApiKey && u.openaiApiKey.trim()),
    hasGrokKey: !!(u.grokApiKey && u.grokApiKey.trim()),
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
}
