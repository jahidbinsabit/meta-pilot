'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, UserX, Crown, Shield } from 'lucide-react';
import type { StatsRecord } from './user-types';

interface UsersStatsCardsProps {
  stats: StatsRecord;
}

export function UsersStatsCards({ stats }: UsersStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Users</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {stats.totalUsers.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Registered accounts</p>
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
            {stats.activeUsers.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">In good standing</p>
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Suspended</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-400">
            {stats.suspendedUsers.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Restricted accounts</p>
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Paid Members</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Crown className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-purple-400">
            {stats.paidUsers.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Pro, Plus & Enterprise</p>
        </CardContent>
      </Card>

      <Card className="col-span-2 bg-card/50 sm:col-span-1">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Admins</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-sky-400">
            {stats.adminUsers.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Elevated privileges</p>
        </CardContent>
      </Card>
    </div>
  );
}
