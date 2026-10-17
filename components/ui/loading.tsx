import { cn } from '@/lib/utils';

/** Branded spinner used across route-level loading states. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label || 'Loading'}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span className="loader-ring" aria-hidden="true" />
    </span>
  );
}

/** Full-page loading screen shown during route transitions. */
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 py-16">
      <span className="loader-ring loader-ring-lg" aria-hidden="true" />
      <p className="text-sm text-muted-foreground animate-pulse">{message || 'Loading…'}</p>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-muted/70', className)} aria-hidden="true" />
  );
}

/** Skeleton mimicking the dashboard shell (sidebar + topbar + content cards). */
export function DashboardSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background" aria-hidden="true">
      <div className="hidden w-60 shrink-0 flex-col gap-3 border-r border-border p-4 lg:flex">
        <SkeletonBlock className="h-9 w-32" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-9 w-9 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-7xl flex-1 space-y-4 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          <SkeletonBlock className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-28 w-full" />
            ))}
          </div>
          <SkeletonBlock className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for generic content pages (marketing / auth-adjacent). */
export function ContentSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-4 px-4 py-10 sm:px-6 lg:px-8"
      aria-hidden="true"
    >
      <SkeletonBlock className="h-10 w-72" />
      <SkeletonBlock className="h-4 w-full max-w-xl" />
      <SkeletonBlock className="h-4 w-full max-w-lg" />
      <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-44 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for table-like admin pages. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0"
          >
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <SkeletonBlock className="h-4 flex-1" />
            <SkeletonBlock className="hidden h-4 w-24 sm:block" />
            <SkeletonBlock className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
