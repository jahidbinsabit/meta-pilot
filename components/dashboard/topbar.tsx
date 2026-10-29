'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Key, Menu, Search } from 'lucide-react';
import { TOOL_META, type ToolSlug } from '@/lib/tools/slugs';
import { useCredits } from '@/components/dashboard/credits-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserApiKeysModal } from '@/components/dashboard/user-api-keys-dialog';
import { resolveAvatarUrl } from '@/lib/avatar';

const SECTION_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/generate': 'Generate',
  '/dashboard/tools': 'Tools',
  '/dashboard/adobe-analytics': 'Adobe Analytics',
  '/dashboard/history': 'History',
  '/dashboard/billing': 'Billing',
  '/dashboard/settings': 'Settings',
  '/dashboard/profile': 'Profile',
};

/** Current-section label for the topbar breadcrumb, derived from the path. */
function breadcrumbLabel(pathname: string | null): string {
  if (!pathname) return 'Dashboard';
  if (SECTION_LABELS[pathname]) return SECTION_LABELS[pathname];
  const toolMatch = pathname.match(/^\/dashboard\/tools\/([^/]+)/);
  if (toolMatch) {
    const meta = TOOL_META[toolMatch[1] as ToolSlug];
    if (meta) return meta.title;
    return toolMatch[1]
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  if (pathname.startsWith('/admin')) return 'Admin';
  const last = pathname.split('/').filter(Boolean).pop();
  return last
    ? last
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Dashboard';
}

export function TopBar({
  user,
  onMenu,
}: {
  user: {
    name?: string | null;
    email: string;
    image?: string | null;
    credits: number;
    membership: string;
    role: string;
  };
  onMenu: () => void;
}) {
  const { credits, unlimited } = useCredits();
  const pathname = usePathname();
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <button
        onClick={onMenu}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
        <Search className="h-4 w-4" />
        <span className="text-muted-foreground/60">/</span>
        <span className="text-foreground">{breadcrumbLabel(pathname)}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <UserApiKeysModal
          trigger={
            <Button variant="outline" size="xs" className="hidden sm:inline-flex items-center gap-1.5 border-border">
              <Key className="h-3.5 w-3.5 text-accent" />
              <span>AI Keys</span>
            </Button>
          }
        />
        <Badge variant={unlimited || credits > 0 ? 'success' : 'warning'} className="hidden sm:inline-flex">
          {unlimited ? 'Unlimited' : `${credits} credits`}
        </Badge>
        <ThemeToggle />
        {/* T1-01/T5-02: the notification bell that used to sit here was a
            bare button with no panel, no fetch, no handler — removed
            rather than left decorative. A real inbox is proposal N4. */}
        <Link
          href="/dashboard/profile"
          className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 transition-colors hover:bg-accent/10"
          aria-label="Open profile"
        >
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {resolveAvatarUrl(user.image) ? (
              <img src={resolveAvatarUrl(user.image)!} alt="" className="h-full w-full object-cover" />
            ) : (
              user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()
            )}
          </div>
          <span className="hidden text-sm text-foreground sm:inline">
            {user.name || user.email}
          </span>
        </Link>
      </div>
    </header>
  );
}
