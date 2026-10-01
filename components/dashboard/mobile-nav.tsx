'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Sparkles,
  Image,
  BarChart3,
  Wrench,
  CreditCard,
  Settings,
  Shield,
  X,
  Zap,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useCredits } from '@/components/dashboard/credits-provider';
import { signOut } from 'next-auth/react';

const NAV: Array<{ label: string; href: string; icon: any; badge?: string; admin?: boolean }> = [
  { label: 'Overview', href: '/dashboard', icon: LayoutGrid },
  { label: 'Metadata Generator', href: '/dashboard/generator', icon: Sparkles },
  { label: 'Image → Prompt', href: '/dashboard/image-to-prompt', icon: Image },
  { label: 'Adobe Analytics', href: '/dashboard/adobe-analytics', icon: BarChart3 },
  { label: 'Tools', href: '/dashboard/tools', icon: Wrench },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, admin: true },
  { label: 'Admin', href: '/admin', icon: Shield, admin: true },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  user: { name?: string | null; email: string; credits: number; membership: string; role: string };
  siteName?: string;
}

export function MobileNav({
  open,
  onClose,
  user,
  siteName = 'StockForge',
}: MobileNavProps) {
  const pathname = usePathname();
  const { credits } = useCredits();
  const isAdmin = user.role === 'ADMIN';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar lg:hidden"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="font-display text-lg font-semibold tracking-tight truncate">
                  {siteName}
                </span>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent/15 text-accent'
                        : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {item.badge && (
                      <Badge variant="info" className="ml-auto text-[10px]">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-3">
              <div className="rounded-xl border border-border bg-card-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Credits
                  </span>
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-mono text-xl font-semibold text-foreground">{credits}</span>
                  <span className="text-xs text-muted-foreground">available</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, (credits / 100) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {user.name || user.email}
                  </p>
                  <p className="truncate text-[11px] capitalize text-muted-foreground">
                    {user.membership.toLowerCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
