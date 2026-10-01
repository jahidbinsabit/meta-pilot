'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Image,
  Sparkles,
  BarChart3,
  Wrench,
  CreditCard,
  Settings,
  LogOut,
  ChevronLeft,
  Zap,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCredits } from '@/components/dashboard/credits-provider';
import { signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  admin?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutGrid },
  { label: 'Metadata Generator', href: '/dashboard/generator', icon: Sparkles },
  { label: 'Image → Prompt', href: '/dashboard/image-to-prompt', icon: Image },
  { label: 'Adobe Analytics', href: '/dashboard/adobe-analytics', icon: BarChart3 },
  { label: 'Tools', href: '/dashboard/tools', icon: Wrench },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, admin: true },
  { label: 'Admin', href: '/admin', icon: Shield, admin: true },
];

export function Sidebar({
  collapsed,
  onCollapse,
  user,
  siteName = 'StockForge',
}: {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  user: { name?: string | null; email: string; credits: number; membership: string; role: string };
  siteName?: string;
}) {
  const pathname = usePathname();
  const { credits } = useCredits();
  const isAdmin = user.role === 'ADMIN';
  
  // Prevent hydration mismatch by only showing credits after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Zap className="h-5 w-5" />
        </div>
        {!collapsed && (
          <span className="font-display text-lg font-semibold tracking-tight truncate">
            {siteName}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {NAV.map((item) => {
          if (item.admin && !isAdmin) return null;
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && item.badge && (
                <Badge variant="info" className="text-[10px]">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Credits panel pinned near bottom */}
      <div className="border-t border-border p-3">
        <div className={cn('rounded-xl border border-border bg-card-2 p-3', collapsed && 'px-2')}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Credits
            </span>
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-xl font-semibold text-foreground">
              {mounted ? credits : user.credits}
            </span>
            <span className="text-xs text-muted-foreground">available</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(100, ((mounted ? credits : user.credits) / 100) * 100)}%` }}
            />
          </div>
          <Link href="/dashboard/billing" className="mt-2 block">
            <Button size="xs" variant="subtle" className="w-full">
              Top up
            </Button>
          </Link>
        </div>

        {/* User chip */}
        <div className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {user.name || user.email}
              </p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">
                {user.membership.toLowerCase()}
              </p>
            </div>
          )}
        </div>

        <div className="mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && 'Sign out'}
          </Button>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => onCollapse(!collapsed)}
        className="hidden h-8 items-center justify-center border-t border-border text-muted-foreground hover:text-foreground lg:flex"
        aria-label="Collapse sidebar"
      >
        <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </div>
  );
}
