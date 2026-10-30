'use client';

import * as React from 'react';
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
  unlimitedMode?: boolean;
  /** Active plan's included credits — denominator for the sidebar credit bar. */
  planCreditsIncluded?: number;
  notifications?: DashboardNotification[];
}

export function AppShell({
  children,
  siteName = 'MetaCSV',
  logoUrl,
  user,
  unlimitedMode = false,
  planCreditsIncluded = 0,
  notifications = [],
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Apply the login form's "Remember this browser" choice (T1-07): when
  // the user unchecked it, downgrade the session cookie to a
  // browser-session cookie once per browser session. The login form
  // stores the choice in localStorage for both the credentials and the
  // Google flow (the latter round-trips off-site, so it can't apply the
  // choice itself).
  React.useEffect(() => {
    try {
      if (localStorage.getItem('sf-remember-me') !== '0') return;
      if (sessionStorage.getItem('sf-session-mode-applied')) return;
      sessionStorage.setItem('sf-session-mode-applied', '1');
      void fetch('/api/account/session-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remember: false }),
      }).catch(() => {
        // best-effort — the 30-day default simply stays in place
      });
    } catch {
      // storage unavailable — nothing to apply
    }
  }, []);

  return (
    <CreditsProvider initialCredits={user.credits} initialUnlimited={unlimitedMode}>
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
            planCreditsIncluded={planCreditsIncluded}
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
