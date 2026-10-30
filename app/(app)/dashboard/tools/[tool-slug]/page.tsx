import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getTool, type ToolEntry } from '@/lib/tools/registry';
import { resolveUserTier, tierAllowedForTool } from '@/lib/tools/gate';
import { prisma } from '@/lib/db';
import getServerSession from '@/lib/server-session';
import { Spinner } from '@/components/ui/loading';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

function ToolFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner label="Loading tool" />
    </div>
  );
}

// Each tool client is code-split with next/dynamic so visiting one tool page
// only downloads that tool's JavaScript — previously all 12 tool clients were
// statically imported, bloating every tool page's first-load bundle.
const ToolClient = nextDynamic(
  () => import('@/components/dashboard/tool-client').then((m) => m.ToolClient),
  {
    loading: () => <ToolFallback />,
  },
);
const BgRemoverClient = nextDynamic(
  () => import('@/components/dashboard/bg-remover-client').then((m) => m.BgRemoverClient),
  {
    loading: () => <ToolFallback />,
  },
);
const BentoClient = nextDynamic(
  () => import('@/components/dashboard/bento-client').then((m) => m.BentoClient),
  {
    loading: () => <ToolFallback />,
  },
);
const PaletteClient = nextDynamic(
  () => import('@/components/dashboard/palette-client').then((m) => m.PaletteClient),
  {
    loading: () => <ToolFallback />,
  },
);
const AsciiClient = nextDynamic(
  () => import('@/components/dashboard/ascii-client').then((m) => m.AsciiClient),
  {
    loading: () => <ToolFallback />,
  },
);
const EventsClient = nextDynamic(
  () => import('@/components/dashboard/events-client').then((m) => m.EventsClient),
  {
    loading: () => <ToolFallback />,
  },
);
const AdobeKeywordsClient = nextDynamic(
  () => import('@/components/dashboard/adobe-keywords-client').then((m) => m.AdobeKeywordsClient),
  {
    loading: () => <ToolFallback />,
  },
);
const AiEpsToJpgClient = nextDynamic(
  () => import('@/components/dashboard/ai-eps-to-jpg-client').then((m) => m.AiEpsToJpgClient),
  {
    loading: () => <ToolFallback />,
  },
);
const HalftoneClient = nextDynamic(
  () => import('@/components/dashboard/halftone-client').then((m) => m.HalftoneClient),
  {
    loading: () => <ToolFallback />,
  },
);
const DitherClient = nextDynamic(
  () => import('@/components/dashboard/dither-client').then((m) => m.DitherClient),
  {
    loading: () => <ToolFallback />,
  },
);
const ImageToPsdClient = nextDynamic(
  () => import('@/components/dashboard/image-to-psd-client').then((m) => m.ImageToPsdClient),
  {
    loading: () => <ToolFallback />,
  },
);

const TEXT_TOOLS = new Set([
  'keyword-clustering',
  'title-ab',
  'alt-text',
  'keyword-density',
  'contrast-checker',
  'batch-export',
]);

/**
 * Display-side mirror of the run gate (lib/tools/gate.ts): the run APIs
 * already refuse tier-excluded users with 403 — the page previously
 * rendered the full runnable UI anyway and let them discover the refusal
 * on submit. Show the same locked state the tools grid uses instead.
 */
function ToolTierLocked({ tool }: { tool: ToolEntry }) {
  const tiers = (tool.enabledForTiers ?? []).join(' / ');
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{tool.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
      <p className="mt-4 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Requires {tiers}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        This tool isn&apos;t included in your current plan.
      </p>
      <Link
        href="/pricing"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90"
      >
        View plans
      </Link>
    </div>
  );
}

export default async function ToolPage({ params }: { params: { 'tool-slug': string } }) {
  const tool = await getTool(params['tool-slug']);
  if (!tool || !tool.isEnabled) notFound();

  // Tier gate (display coherence with assertToolRunnable): ADMIN bypasses
  // the tier list, exactly as the run gate does.
  if (tool.enabledForTiers && tool.enabledForTiers.length > 0) {
    const session = await getServerSession();
    const email = session?.user?.email;
    const dbUser = email
      ? await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
      : null;
    if (dbUser?.role !== 'ADMIN') {
      const tier = dbUser ? await resolveUserTier(dbUser.id) : 'FREE';
      if (!tierAllowedForTool(tool.enabledForTiers, tier)) {
        return <ToolTierLocked tool={tool} />;
      }
    }
  }

  switch (tool.slug) {
    case 'bg-remover':
      return <BgRemoverClient tool={tool} />;
    case 'bento-builder':
      return <BentoClient tool={tool} />;
    case 'palette':
      return <PaletteClient tool={tool} />;
    case 'ascii-vision':
      return <AsciiClient tool={tool} />;
    case 'events':
      return <EventsClient tool={tool} />;
    case 'adobe-keywords':
      return <AdobeKeywordsClient tool={tool} />;
    case 'ai-eps-to-jpg':
      return <AiEpsToJpgClient tool={tool} />;
    case 'halftone-studio':
      return <HalftoneClient tool={tool} />;
    case 'dither-studio':
      return <DitherClient tool={tool} />;
    case 'image-to-psd':
      return <ImageToPsdClient tool={tool} />;
    default:
      if (TEXT_TOOLS.has(tool.slug)) return <ToolClient slug={tool.slug} tool={tool} />;
      notFound();
  }
}

export function generateStaticParams() {
  return [
    'bg-remover',
    'bento-builder',
    'palette',
    'ascii-vision',
    'events',
    'adobe-keywords',
    'ai-eps-to-jpg',
    'halftone-studio',
    'dither-studio',
    'image-to-psd',
    'keyword-clustering',
    'title-ab',
    'alt-text',
    'keyword-density',
    'contrast-checker',
    'batch-export',
  ].map((slug) => ({ 'tool-slug': slug }));
}
