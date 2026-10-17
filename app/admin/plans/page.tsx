import { prisma } from '@/lib/db';
import { PlansClient } from '@/components/admin/plans-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return <PlansClient initialPlans={plans} />;
}
