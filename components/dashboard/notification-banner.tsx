'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DashboardNotification {
  id: string;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

const STORAGE_KEY = 'sf_dismissed_notifications';

/**
 * The stored shape is a bare id list (no timestamps), so age-based
 * pruning isn't possible — cap it instead: only the 200 most recently
 * dismissed ids are retained. Enforced on load and on write.
 */
const MAX_DISMISSED_IDS = 200;

export function NotificationBanner({ notifications }: { notifications: DashboardNotification[] }) {
  const [mounted, setMounted] = React.useState(false);
  const [dismissedIds, setDismissedIds] = React.useState<string[]>([]);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDismissedIds(
          parsed
            .filter((value): value is string => typeof value === 'string')
            .slice(-MAX_DISMISSED_IDS),
        );
      }
    } catch {
      // ignore malformed persisted state
    }
  }, []);

  const visibleNotifications = React.useMemo(
    () => notifications.filter((notification) => !dismissedIds.includes(notification.id)),
    [dismissedIds, notifications],
  );

  React.useEffect(() => {
    if (visibleNotifications.length === 0) return;
    if (index >= visibleNotifications.length) setIndex(0);
  }, [index, visibleNotifications]);

  const current = visibleNotifications[index] ?? null;

  if (!mounted || !current) return null;

  const dismissCurrent = () => {
    const nextDismissed = Array.from(new Set([...dismissedIds, current.id])).slice(
      -MAX_DISMISSED_IDS,
    );
    setDismissedIds(nextDismissed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDismissed));
    } catch {
      // ignore storage issues in restricted browsers
    }
  };

  const visibleCount = visibleNotifications.length;
  // The prev/next handlers WRAP around the ends — the buttons must not
  // also be disabled at the ends (T1-15: the two behaviours contradicted
  // each other, so the wrap was unreachable). Enabled whenever there is
  // more than one banner to move between.

  // CSS enter animation keyed by notification id (replaces framer-motion).
  // Exit animations are dropped — the banner simply unmounts on dismiss.
  return (
    <div
      key={current.id}
      className="animate-banner-in pointer-events-none fixed inset-x-0 top-[56px] z-40 px-3 sm:px-6"
    >
      <div className="pointer-events-auto mx-auto max-w-6xl overflow-hidden rounded-b-xl border border-violet-500/40 border-t-0 bg-[#1c1c1e] shadow-2xl shadow-black/20">
        <div className="flex items-center gap-3 border-l-2 border-violet-500 bg-[#1c1c1e]/95 px-4 py-3 sm:px-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-300/80">
              <span>Update</span>
              {visibleCount > 1 && (
                <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
                  {index + 1} of {visibleCount}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{current.title}</p>
                <p className="mt-1 max-w-3xl text-sm text-slate-300">{current.body}</p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {current.ctaUrl && current.ctaLabel ? (
                  <Button
                    asChild
                    size="sm"
                    className="h-8 bg-violet-600 text-violet-50 hover:bg-violet-500"
                  >
                    {/* T1-15: only external links open a new tab — an
                        internal CTA (e.g. /dashboard/billing) used to
                        eject the user into a fresh tab unconditionally. */}
                    {/^https?:\/\//i.test(current.ctaUrl) ? (
                      <a href={current.ctaUrl} target="_blank" rel="noreferrer">
                        {current.ctaLabel}
                      </a>
                    ) : (
                      <a href={current.ctaUrl}>{current.ctaLabel}</a>
                    )}
                  </Button>
                ) : null}
                {visibleCount > 1 && (
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1">
                    <button
                      type="button"
                      onClick={() => setIndex((prev) => (prev > 0 ? prev - 1 : visibleCount - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/10 hover:text-foreground"
                      aria-label="Previous notification"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndex((prev) => (prev < visibleCount - 1 ? prev + 1 : 0))}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/10 hover:text-foreground"
                      aria-label="Next notification"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={dismissCurrent}
                  aria-label="Dismiss notification"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
