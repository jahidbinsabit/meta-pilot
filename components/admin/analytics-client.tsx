'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const DATA = [
  { day: 'Mon', signups: 4, gens: 12, revenue: 42 },
  { day: 'Tue', signups: 7, gens: 19, revenue: 68 },
  { day: 'Wed', signups: 3, gens: 8, revenue: 24 },
  { day: 'Thu', signups: 9, gens: 24, revenue: 88 },
  { day: 'Fri', signups: 12, gens: 31, revenue: 124 },
  { day: 'Sat', signups: 18, gens: 44, revenue: 176 },
  { day: 'Sun', signups: 14, gens: 38, revenue: 152 },
];

export function AnalyticsClient({ stats }: { stats: any }) {
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
          <CardTitle>Weekly activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="signups" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gens" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
