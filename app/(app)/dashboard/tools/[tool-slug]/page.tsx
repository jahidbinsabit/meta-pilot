import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getTool } from '@/lib/tools/registry';
import { ToolClient } from '@/components/dashboard/tool-client';
import { BgRemoverClient } from '@/components/dashboard/bg-remover-client';
import { BentoClient } from '@/components/dashboard/bento-client';
import { PaletteClient } from '@/components/dashboard/palette-client';
import { AsciiClient } from '@/components/dashboard/ascii-client';
import { EventsClient } from '@/components/dashboard/events-client';
import { AdobeKeywordsClient } from '@/components/dashboard/adobe-keywords-client';
import { AiEpsToJpgClient } from '@/components/dashboard/ai-eps-to-jpg-client';
import { HalftoneClient } from '@/components/dashboard/halftone-client';
import { DitherClient } from '@/components/dashboard/dither-client';
import { ImageToPsdClient } from '@/components/dashboard/image-to-psd-client';

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
