import { prisma } from '@/lib/db';
import { CreditPackagesClient } from '@/components/admin/credit-packages-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

export default async function CreditPackagesPage() {
  const packages = await prisma.creditPackage.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return <CreditPackagesClient initialPackages={packages} />;
}
