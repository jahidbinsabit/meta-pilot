import { prisma } from '@/lib/db';
import { CreditPackagesClient } from '@/components/admin/credit-packages-client';

export default async function CreditPackagesPage() {
  const packages = await prisma.creditPackage.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return <CreditPackagesClient initialPackages={packages} />;
}
