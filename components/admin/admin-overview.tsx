import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, CreditCard, Cog, Zap, TrendingUp, Activity, Settings, Bot } from 'lucide-react';

export function AdminOverview({
  users,
  orders,
  jobs,
  providers,
  revenue,
}: {
  users: number;
  orders: number;
  jobs: number;
  providers: number;
  revenue: number;
}) {
  const stats = [
    { label: 'Total users', value: users, icon: Users },
    { label: 'Orders', value: orders, icon: CreditCard },
    { label: 'Active providers', value: providers, icon: Cog },
    { label: 'Jobs queued', value: jobs, icon: Activity },
    { label: 'Revenue (USD)', value: `$${(revenue / 100).toFixed(2)}`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Overview</h1>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent/10"
            >
              <Bot className="h-4 w-4 text-accent" /> Adobe Stock Scraper &amp; Platform Settings
            </Link>
            <Link
              href="/admin/ai-providers"
              className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent/10"
            >
              <Zap className="h-4 w-4 text-accent" /> Configure AI providers
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent/10"
            >
              <Users className="h-4 w-4 text-accent" /> Manage users
            </Link>
            <Link
              href="/admin/payments"
              className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent/10"
            >
              <CreditCard className="h-4 w-4 text-accent" /> Payments
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Active AI provider: <span className="text-foreground">Gemini</span>
            </p>
            <p>
              Queue: <span className="text-foreground">BullMQ + Redis</span>
            </p>
            <p>
              Payments: <span className="text-foreground">Stripe + bKash/Nagad</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
