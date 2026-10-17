'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/topbar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { CreditsProvider } from '@/components/dashboard/credits-provider';
import {
  NotificationBanner,
  type DashboardNotification,
} from '@/components/dashboard/notification-banner';

interface AppShellProps {
  children: React.ReactNode;
  siteName?: string;
  logoUrl?: string | null;
  user: {
    name?: string | null;
    email: string;
    image?: string | null;
    credits: number;
    membership: string;
    role: string;
  };
  notifications?: DashboardNotification[];
}

export function AppShell({
  children,
  siteName = 'StockForge AI',
  logoUrl,
  user,
  notifications = [],
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <CreditsProvider initialCredits={user.credits}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar — CSS width transition instead of framer-motion
            so the animation library stays out of the critical shell bundle. */}
        <aside
          style={{ width: collapsed ? 64 : 240 }}
          className="hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out lg:flex"
        >
          <Sidebar
            collapsed={collapsed}
            onCollapse={setCollapsed}
            user={user}
            siteName={siteName}
            logoUrl={logoUrl}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} onMenu={() => setMobileOpen(true)} />
          <NotificationBanner notifications={notifications} />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>

        {/* Mobile nav */}
        <MobileNav
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          user={user}
          siteName={siteName}
          logoUrl={logoUrl}
        />
      </div>
    </CreditsProvider>
  );
}
