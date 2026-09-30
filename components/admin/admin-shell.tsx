'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Users,
  Crown,
  Coins,
  CreditCard,
  Zap,
  Wrench,
  Globe,
  Bell,
  BarChart3,
  ScrollText,
  Settings,
  SlidersHorizontal,
  LogOut,
  Shield,
  Package,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Admin console shell (PROMPT 9).
 *
 * Fully separate from the user dashboard shell but built from the same
 * design tokens: dark-mode-first, accent-highlighted active nav, collapsible
 * sidebar, user chip + "back to dashboard" pinned at the bottom.
 */
const NAV = [
  { label: 'Overview', href: '/admin', icon: LayoutGrid },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Plans', href: '/admin/plans', icon: Crown },
  { label: 'Credit Packages', href: '/admin/credit-packages', icon: Package },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'AI Providers', href: '/admin/ai-providers', icon: Zap },
  { label: 'Tools', href: '/admin/tools', icon: Wrench },
  { label: 'Homepage', href: '/admin/homepage', icon: Globe },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ClipboardList },
  { label: 'Prompt Styles', href: '/admin/prompt-styles', icon: SlidersHorizontal },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name?: string | null; email: string; role: string };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-sidebar lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Shield className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-semibold tracking-tight">Admin</span>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          {NAV.map((item) => {
            const active =
              item.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
              {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {user.name || user.email}
                </p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {user.role.toLowerCase()}
                </p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start gap-2 text-muted-foreground"
            asChild
          >
            <Link href="/dashboard">
              <LogOut className="h-4 w-4" /> Back to dashboard
            </Link>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Admin Console
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
