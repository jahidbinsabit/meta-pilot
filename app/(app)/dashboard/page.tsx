import Link from 'next/link';
import {
  Sparkles,
  Image,
  BarChart3,
  Wrench,
  Zap,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';

const TOOLS = [
  {
    href: '/dashboard/generator',
    icon: Sparkles,
    title: 'Metadata Generator',
    desc: 'AI titles, descriptions & keywords for stock images.',
    badge: 'Popular',
  },
  {
    href: '/dashboard/image-to-prompt',
    icon: Image,
    title: 'Image → Prompt',
    desc: 'Reverse-engineer an image into a generation prompt.',
  },
  {
    href: '/dashboard/adobe-analytics',
    icon: BarChart3,
    title: 'Adobe Analytics',
    desc: 'Track downloads, revenue & views on Adobe Stock.',
  },
  {
    href: '/dashboard/tools',
    icon: Wrench,
    title: 'All Tools Collection',
    desc: 'Micro-tools: clustering, alt-text, palettes & more.',
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
          where: {
            userId,
            type: 'SPEND',
            createdAt: { gte: startOfToday },
          },
          _sum: {
            amount: true,
          },
        })
      : null,
  ]);

  const activePlanName =
    user?.memberships?.[0]?.plan?.name ||
    (user?.memberships?.[0]?.plan?.tier
      ? user.memberships[0].plan.tier.charAt(0) + user.memberships[0].plan.tier.slice(1).toLowerCase()
      : user?.membership
        ? user.membership.charAt(0) + user.membership.slice(1).toLowerCase()
        : 'Free');

  const todayCreditsUsed = Math.abs(creditsSpentToday?._sum?.amount || 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Overview
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total generations" value={totalJobs} icon={Sparkles} />
        <Stat
          label="Completed"
          value={recent.filter((r) => r.status === 'COMPLETED').length}
          icon={TrendingUp}
        />
        <Stat label="Credits used today" value={todayCreditsUsed} icon={Zap} />
        <Stat label="Active membership" value={activePlanName} icon={Clock} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Tools
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="group">
              <Card className="h-full transition-colors hover:border-accent/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <t.icon className="h-5 w-5" />
                    </div>
                    {t.badge && <Badge variant="info">{t.badge}</Badge>}
                  </div>
                  <CardTitle className="mt-3">{t.title}</CardTitle>
                  <CardDescription>{t.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent generations</CardTitle>
            <CardDescription>Your last 5 metadata runs.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No generations yet.{' '}
                <Link href="/dashboard/generator" className="text-accent hover:underline">
                  Generate your first one →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.map((r: any) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.title || r.originalName || 'Untitled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(r.keywords || []).length} keywords · {r.createdAt.toLocaleDateString()}
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
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/dashboard/generator" className="block">
              <div className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent/10">
                <span className="text-sm">Generate metadata</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/dashboard/billing" className="block">
              <div className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent/10">
                <span className="text-sm">Top up credits</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/dashboard/tools" className="block">
              <div className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-accent/10">
                <span className="text-sm">Open tool collection</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
