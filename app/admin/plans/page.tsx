import { prisma } from '@/lib/db';
import { PlansClient } from '@/components/admin/plans-client';

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return <PlansClient initialPlans={plans} />;
}
