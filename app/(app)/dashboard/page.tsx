import Link from 'next/link';
import {
  Sparkles,
  Image,
  BarChart3,
  Wrench,
  Zap,
  TrendingUp,
  ArrowRight,
  Play,
  Calendar,
  Plus,
  CreditCard,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';

const QUICK_ACTIONS = [
  {
    href: '/dashboard/generator',
    icon: Sparkles,
    title: 'Generate Metadata',
    desc: 'AI-powered titles, descriptions & keywords',
    primary: true,
  },
  {
    href: '/dashboard/image-to-prompt',
    icon: Image,
    title: 'Image to Prompt',
    desc: 'Extract prompts from your images',
  },
  {
    href: '/dashboard/adobe-analytics',
    icon: BarChart3,
    title: 'Analytics',
    desc: 'Adobe Stock performance data',
  },
  {
    href: '/dashboard/tools',
    icon: Wrench,
    title: 'All Tools',
    desc: 'Browse creative micro-tools',
  },
];

export default async function DashboardPage() {
  const session = await getServerSession();
  const sessionEmail = session?.user?.email;
  const sessionUserId = (session?.user as any)?.id as string | undefined;

  const user = sessionEmail
    ? await prisma.user.findUnique({
        where: { email: sessionEmail },
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            include: { plan: true },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      })
    : sessionUserId
      ? await prisma.user.findUnique({
          where: { id: sessionUserId },
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { plan: true },
              orderBy: { startedAt: 'desc' },
              take: 1,
            },
          },
        })
      : null;

  const userId = user?.id || sessionUserId;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [recent, totalJobs, creditsSpentToday] = await Promise.all([
    userId
      ? prisma.generatedMetadata.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [],
    userId ? prisma.generatedMetadata.count({ where: { userId } }) : 0,
    userId
      ? prisma.creditTransaction.aggregate({
          where: { userId, type: 'SPEND', createdAt: { gte: startOfToday } },
          _sum: { amount: true },
        })
      : null,
  ]);

  const activePlanName =
    user?.memberships?.[0]?.plan?.name ||
    (user?.memberships?.[0]?.plan?.tier
      ? user.memberships[0].plan.tier.charAt(0) +
        user.memberships[0].plan.tier.slice(1).toLowerCase()
      : user?.membership
        ? user.membership.charAt(0) + user.membership.slice(1).toLowerCase()
        : 'Free');

  const todayCreditsUsed = Math.abs(creditsSpentToday?._sum?.amount || 0);
  const availableCredits = user?.credits ?? 0;
  const creditProgress = Math.min(100, (availableCredits / 100) * 100);

  return (
    <div className="space-y-8">
      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="text-sm text-muted-foreground">Ready to create something great?</p>
          </div>
          <Badge variant="default" className="hidden shrink-0 items-center gap-1.5 px-3 py-1.5 sm:flex">
            <Zap className="h-3.5 w-3.5" />
            {activePlanName}
          </Badge>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-transparent" />
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Credits */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Credits
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">{availableCredits}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Zap className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${creditProgress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Used Today */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Used Today
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">{todayCreditsUsed}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Generated */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Generated
                </p>
                <p className="mt-1 font-mono text-2xl font-bold">{totalJobs}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Up CTA */}
        <Link href="/dashboard/billing" className="group">
          <Card className="h-full cursor-pointer transition-all hover:border-accent/40 hover:shadow-glow">
            <CardContent className="flex h-full items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Billing
                </p>
                <p className="mt-1 text-sm font-semibold text-accent">Top up credits</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform group-hover:scale-110">
                <Plus className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Quick Actions ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <Link href="/dashboard/tools" className="text-sm text-accent hover:underline">
            All tools &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="group">
                <Card
                  className={`h-full transition-all hover:border-accent/40 hover:shadow-glow${
                    action.primary ? ' border-accent/20 bg-accent/5' : ''
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform group-hover:scale-105">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 font-semibold">{action.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{action.desc}</p>
                    {action.primary && (
                      <Button size="sm" variant="subtle" className="mt-4 w-full gap-1.5">
                        <Play className="h-3 w-3" />
                        Start Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Recent Activity ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription className="mt-0.5">Your latest metadata generations</CardDescription>
            </div>
            <Link href="/dashboard/generator">
              <Button variant="ghost" size="sm" className="gap-1.5">
                New generation
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {totalJobs === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-semibold">No generations yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create AI-powered metadata for your first image
              </p>
              <Link href="/dashboard/generator" className="mt-4">
                <Button size="sm" className="gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  Generate Now
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/30 p-3.5 transition-colors hover:bg-card/60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.title || r.originalName || 'Untitled'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{(r.keywords || []).length} keywords</span>
                      <span>&middot;</span>
                      <Calendar className="h-3 w-3" />
                      <span>{r.createdAt.toLocaleDateString()}</span>
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === 'COMPLETED'
                        ? 'success'
                        : r.status === 'FAILED'
                          ? 'warning'
                          : 'muted'
                    }
                    className="shrink-0 capitalize"
                  >
                    {r.status.toLowerCase()}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
