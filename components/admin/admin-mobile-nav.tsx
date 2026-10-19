'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Shield, LogOut, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV } from '@/components/admin/admin-shell';

/**
 * Mobile nav drawer for the admin console.
 * The desktop sidebar is `hidden lg:flex`, so below lg this drawer is the
 * only way to reach admin sections — mirrors the dashboard MobileNav pattern.
 */
export function AdminMobileNav({
  open,
  onClose,
  user,
  siteName = 'MetaCSV',
  logoUrl,
}: {
  open: boolean;
  onClose: () => void;
  user: { name?: string | null; email: string; role: string };
  siteName?: string;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();

  // CSS enter animations replace framer-motion (exit = instant close).
  if (!open) return null;

  return (
    <>
      <div
        className="animate-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={onClose}
      />
      <aside className="animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={siteName} className="h-9 w-9 object-contain rounded-lg" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Shield className="h-5 w-5" />
              </div>
            )}
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-sm font-semibold tracking-tight">
                {siteName}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent">
                Admin Console
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
              {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {user.name || user.email}
              </p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {user.role.toLowerCase()}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            onClick={onClose}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </aside>
    </>
  );
}
