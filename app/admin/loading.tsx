import { TableSkeleton } from '@/components/ui/loading';

export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <TableSkeleton rows={8} />
    </div>
  );
}
