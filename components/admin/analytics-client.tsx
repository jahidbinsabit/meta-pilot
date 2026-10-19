'use client';

import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

type DailyRow = { day: string; fullDay: string; generations: number };
type ToolRow = { tool: string; count: number };
type UserDailyRow = { day: string; userId: string; name: string; email: string; count: number };

export function AnalyticsClient({
  stats,
  daily,
  tools,
  userDaily,
  days,
}: {
  stats: any;
  daily: DailyRow[];
  tools: ToolRow[];
  userDaily: UserDailyRow[];
  days: number;
}) {
  const [userFilter, setUserFilter] = React.useState('');
  const filteredUsers = userDaily.filter(
    (r) =>
      !userFilter ||
      r.name.toLowerCase().includes(userFilter.toLowerCase()) ||
      r.email.toLowerCase().includes(userFilter.toLowerCase())
  );
  const totalGens = daily.reduce((s, d) => s + d.generations, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Platform Analytics</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Users', value: stats.users },
          { label: 'Orders', value: stats.orders },
          { label: 'Jobs', value: stats.jobs },
          { label: 'Generations', value: stats.gens },
          { label: 'Revenue', value: `$${(stats.revenue / 100).toFixed(2)}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
              <div className="mt-2 font-mono text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily generations</CardTitle>
          <CardDescription>
            ToolJob generations per day — last {days} days (total {totalGens}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDay || ''}
                />
                <Bar dataKey="generations" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generations by tool</CardTitle>
            <CardDescription>Last {days} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No generations in this period.</p>
            ) : (
              <div className="space-y-2">
                {tools.map((t) => (
                  <div key={t.tool} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{t.tool}</span>
                    <span className="font-mono font-semibold">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-user daily generations</CardTitle>
            <CardDescription>
              Who generated what, per day — last {days} days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="text"
              placeholder="Filter by name or email…"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="mb-3 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            />
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data in this period.</p>
            ) : (
              <div className="max-h-[300px] space-y-1 overflow-y-auto">
                {filteredUsers.map((r, i) => (
                  <div
                    key={`${r.day}-${r.userId}-${i}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate" title={r.email}>
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.day}</span>
                    <span className="shrink-0 font-mono font-semibold">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
