'use client';

import * as React from 'react';
import { Bell, Key, Menu, Search } from 'lucide-react';
import { useCredits } from '@/components/dashboard/credits-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserApiKeysModal } from '@/components/dashboard/user-api-keys-dialog';

export function TopBar({
  user,
  onMenu,
}: {
  user: { name?: string | null; email: string; credits: number; membership: string; role: string };
  onMenu: () => void;
}) {
  const { credits } = useCredits();
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
        <span className="text-foreground">Dashboard</span>
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
        <Badge variant={credits > 0 ? 'success' : 'warning'} className="hidden sm:inline-flex">
          {credits} credits
        </Badge>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {user.name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}
          </div>
          <span className="hidden text-sm text-foreground sm:inline">
            {user.name || user.email}
          </span>
        </div>
      </div>
    </header>
  );
}
