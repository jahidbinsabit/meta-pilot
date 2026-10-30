import Link from 'next/link';
import { Suspense, cache } from 'react';
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
import { getSiteSettings } from '@/lib/site-settings';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';

const QUICK_ACTIONS = [
  {
    href: '/dashboard/generate',
    icon: Sparkles,
    title: 'Generate Metadata',
    desc: 'AI-powered titles, descriptions & keywords',
    primary: true,
  },
  {
    href: '/dashboard/generate?tab=prompt',
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

// Dedupe the user lookup across the page + Suspense sub-sections within one request.
const getDashboardUser = cache(async () => {
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

  return { user, userId: user?.id || sessionUserId };
});

function planDisplayName(user: any): string {
  return (
    user?.memberships?.[0]?.plan?.name ||
    (user?.memberships?.[0]?.plan?.tier
      ? user.memberships[0].plan.tier.charAt(0) +
        user.memberships[0].plan.tier.slice(1).toLowerCase()
      : user?.membership
        ? user.membership.charAt(0) + user.membership.slice(1).toLowerCase()
        : 'Free')
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-5">
          <div className="h-3 w-16 rounded bg-muted/70" />
          <div className="mt-2 h-7 w-20 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-xl border border-border p-3.5"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-muted/70" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-2/3 rounded bg-muted/70" />
            <div className="mt-1.5 h-3 w-1/3 rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Streams in after the hero — stats queries run in parallel here. */
async function StatsSection() {
  const { userId, user } = await getDashboardUser();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Since the polling migration the dashboard generators write results
  // only into ToolJob.outputData; GeneratedMetadata is written solely by
  // the legacy single-image route (which creates no ToolJob), so the two
  // counts cover disjoint generations and can be summed safely.
  const [metaCount, jobCount, creditsSpentToday, settings] = await Promise.all([
    userId ? prisma.generatedMetadata.count({ where: { userId } }) : 0,
    userId ? prisma.toolJob.count({ where: { userId, status: 'COMPLETE' } }) : 0,
    userId
      ? prisma.creditTransaction.aggregate({
          where: { userId, type: 'SPEND', createdAt: { gte: startOfToday } },
          _sum: { amount: true },
        })
      : null,
    getSiteSettings().catch(() => null),
  ]);

  const totalJobs = metaCount + jobCount;
  // Match /api/credits (sidebar/topbar) semantics exactly: the global
  // unlimited-mode flag decides whether the balance renders as a number.
  const unlimited = settings?.unlimitedMode === true;

  const todayCreditsUsed = Math.abs(creditsSpentToday?._sum?.amount || 0);
  const availableCredits = user?.credits ?? 0;
  // T1-20: the bar's denominator used to be a hardcoded 100, so the fill
  // meant nothing (a 6,000-credit Agency wallet and a 70-credit wallet
  // rendered identically). Measure against the active plan's included
  // credits — the grant the balance is drawn down from. No plan grant
  // (FREE tier) → no meaningful denominator → no bar.
  const planCreditsIncluded = user?.memberships?.[0]?.plan?.creditsIncluded ?? 0;
  const creditProgress =
    planCreditsIncluded > 0
      ? Math.min(100, (availableCredits / planCreditsIncluded) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Credits */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Credits
              </p>
              {unlimited ? (
                <p className="mt-1 text-2xl font-bold">Unlimited</p>
              ) : (
                <p className="mt-1 font-mono text-2xl font-bold">{availableCredits}</p>
              )}
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Zap className="h-5 w-5" />
            </div>
          </div>
          {unlimited ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Wallet: {availableCredits} credits
            </p>
          ) : creditProgress !== null ? (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${creditProgress}%` }}
              />
            </div>
          ) : null}
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
  );
}

interface RecentItem {
  key: string;
  title: string;
  sub: string;
  date: Date;
  status: string;
  isPromptJob: boolean;
}

/** Streams in after the hero — recent generations list. */
async function RecentSection() {
  const { userId } = await getDashboardUser();
  const [recentMeta, recentJobs, metaCount, jobCount] = await Promise.all([
    userId
      ? prisma.generatedMetadata.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [],
    userId
      ? prisma.toolJob.findMany({
          where: { userId, status: 'COMPLETE' },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [],
    userId ? prisma.generatedMetadata.count({ where: { userId } }) : 0,
    userId ? prisma.toolJob.count({ where: { userId, status: 'COMPLETE' } }) : 0,
  ]);

  // Merge legacy single-image rows with completed batch/prompt jobs —
  // the polling generators only ever produce the latter.
  const items: RecentItem[] = [
    ...recentMeta.map((r: any) => ({
      key: `meta-${r.id}`,
      title: r.title || r.originalName || 'Untitled',
      sub: `${(r.keywords || []).length} keywords`,
      date: r.createdAt as Date,
      status: r.status as string,
      isPromptJob: false,
    })),
    ...recentJobs.map((j: any) => {
      const output: any = j.outputData ?? {};
      const results: any[] = Array.isArray(output.results) ? output.results : [];
      const first =
        results.find((r) => r && (r.title || r.fileName)) || results[0] || {};
      const inputCount = Array.isArray(j.inputFileUrls) ? j.inputFileUrls.length : 0;
      const n = results.length || inputCount;
      const isPromptJob = j.toolSlug === 'image-to-prompt';
      return {
        key: `job-${j.id}`,
        title: first.title || first.fileName || (isPromptJob ? 'Image to Prompt' : 'Metadata batch'),
        sub: `Batch · ${n} image${n === 1 ? '' : 's'} · ${isPromptJob ? 'Image to Prompt' : 'Metadata'}`,
        date: j.createdAt as Date,
        status: j.status === 'COMPLETE' ? 'COMPLETED' : (j.status as string),
        isPromptJob,
      };
    }),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);

  if (metaCount + jobCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Sparkles className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-semibold">No generations yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create AI-powered metadata for your first image
        </p>
        <Link href="/dashboard/generate" className="mt-4">
          <Button size="sm" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Generate Now
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center gap-3 rounded-xl border border-border bg-card/30 p-3.5 transition-colors hover:bg-card/60"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {item.isPromptJob ? (
              <Image className="h-4.5 w-4.5" />
            ) : (
              <Sparkles className="h-4.5 w-4.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{item.sub}</span>
              <span>&middot;</span>
              <Calendar className="h-3 w-3" />
              <span>{item.date.toLocaleDateString()}</span>
            </p>
          </div>
          <Badge
            variant={
              item.status === 'COMPLETED'
                ? 'success'
                : item.status === 'FAILED'
                  ? 'warning'
                  : 'muted'
            }
            className="shrink-0 capitalize"
          >
            {item.status.toLowerCase()}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await getDashboardUser();
  const activePlanName = planDisplayName(user);

  return (
    <div className="space-y-8">
      <OnboardingChecklist />
      {/* ── Hero Banner (renders immediately) ── */}
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
          <Badge
            variant="default"
            className="hidden shrink-0 items-center gap-1.5 px-3 py-1.5 sm:flex"
          >
            <Zap className="h-3.5 w-3.5" />
            {activePlanName}
          </Badge>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-transparent" />
      </div>

      {/* ── Stats Row (streams in) ── */}
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* ── Quick Actions (renders immediately) ── */}
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

      {/* ── Recent Activity (streams in) ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription className="mt-0.5">Your latest metadata generations</CardDescription>
            </div>
            <Link href="/dashboard/generate">
              <Button variant="ghost" size="sm" className="gap-1.5">
                New generation
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RecentSkeleton />}>
            <RecentSection />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Billing shortcut ── */}
      <Link
        href="/dashboard/billing"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent"
      >
        <CreditCard className="h-3.5 w-3.5" /> Manage billing
      </Link>
    </div>
  );
}
