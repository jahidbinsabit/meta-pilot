'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export function AppShell({ children, user, notifications = [] }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <CreditsProvider initialCredits={user.credits}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 64 : 240 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="hidden shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
        >
          <Sidebar collapsed={collapsed} onCollapse={setCollapsed} user={user} />
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user} onMenu={() => setMobileOpen(true)} />
          <NotificationBanner notifications={notifications} />
          <main className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={typeof window !== 'undefined' ? window.location.pathname : 'page'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Mobile nav */}
        <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} />
      </div>
    </CreditsProvider>
  );
}
