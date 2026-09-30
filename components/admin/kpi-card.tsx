import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

/**
 * KPI card used on the Overview (PROMPT 9.1) and elsewhere.
 *
 * Optional `trend` shows a signed delta; `alert` renders a red badge for
 * things like the pending-manual-payments count.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  alert,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  alert?: boolean;
  sub?: string;
  className?: string;
}) {
  return (
    <Card className={cn('relative', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            {alert && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
            )}
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        {trend && (
          <p
            className={cn(
              'mt-1 text-[11px] font-medium',
              trend.value >= 0 ? 'text-emerald-400' : 'text-destructive',
            )}
          >
            {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Skeleton that mirrors the KPI card grid while data loads. */
export function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="h-3 w-24 shimmer rounded" />
            <div className="mt-3 h-7 w-16 shimmer rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Generic empty state for tables/lists. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground/60" />}
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
