'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
        setDismissedIds(parsed.filter((value): value is string => typeof value === 'string'));
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
    const nextDismissed = Array.from(new Set([...dismissedIds, current.id]));
    setDismissedIds(nextDismissed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDismissed));
    } catch {
      // ignore storage issues in restricted browsers
    }
  };

  const visibleCount = visibleNotifications.length;
  const canPrev = visibleCount > 1 && index > 0;
  const canNext = visibleCount > 1 && index < visibleCount - 1;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="pointer-events-none fixed inset-x-0 top-[56px] z-40 px-3 sm:px-6"
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
                      <a href={current.ctaUrl} target="_blank" rel="noreferrer">
                        {current.ctaLabel}
                      </a>
                    </Button>
                  ) : null}
                  {visibleCount > 1 && (
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1">
                      <button
                        type="button"
                        onClick={() => setIndex((prev) => (prev > 0 ? prev - 1 : visibleCount - 1))}
                        disabled={!canPrev}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Previous notification"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIndex((prev) => (prev < visibleCount - 1 ? prev + 1 : 0))}
                        disabled={!canNext}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
      </motion.div>
    </AnimatePresence>
  );
}
