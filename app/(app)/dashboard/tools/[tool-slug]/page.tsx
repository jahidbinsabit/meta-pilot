import nextDynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { getTool } from '@/lib/tools/registry';
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

export default async function ToolPage({ params }: { params: { 'tool-slug': string } }) {
  const tool = await getTool(params['tool-slug']);
  if (!tool || !tool.isEnabled) notFound();

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
