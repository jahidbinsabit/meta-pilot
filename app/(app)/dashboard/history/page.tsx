import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { HistoryClient } from '@/components/dashboard/history-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your past metadata and image-to-prompt batches — reopen any batch to view or
          re-download its results.
        </p>
      </div>
      <HistoryClient />
    </div>
  );
}
