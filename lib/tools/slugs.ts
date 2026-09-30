/**
 * Canonical tool slugs used across the platform.
 *
 * Single source of truth so the schema (Plan.features, AiProviderConfig
 * .isActiveForToolSlug, ToolJob.toolSlug) and the UI stay in sync.
 */

export const TOOL_SLUGS = [
  'metadata-generator',
  'image-to-prompt',
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
  'adobe-analytics',
] as const;

export type ToolSlug = (typeof TOOL_SLUGS)[number];

export const TOOL_META: Record<ToolSlug, { title: string; desc: string; cost: number }> = {
  'metadata-generator': {
    title: 'Metadata Generator',
    desc: 'AI titles, descriptions & keywords for stock images.',
    cost: 1,
  },
  'image-to-prompt': {
    title: 'Image → Prompt',
    desc: 'Reverse-engineer an image into a generation prompt.',
    cost: 1,
  },
  'bg-remover': {
    title: 'Background Remover',
    desc: 'Remove image backgrounds in one click.',
    cost: 1,
  },
  'bento-builder': {
    title: 'Bento Builder',
    desc: 'Assemble a bento-box image grid and export as PNG.',
    cost: 1,
  },
  palette: { title: 'Color Palette', desc: 'Extract a color palette from an image.', cost: 1 },
  'ascii-vision': {
    title: 'ASCII Vision',
    desc: 'Convert an image to ASCII art, export text or PNG.',
    cost: 1,
  },
  events: { title: 'Events', desc: 'A content calendar for stock-content creators.', cost: 0 },
  'adobe-keywords': {
    title: 'Adobe Keywords',
    desc: 'AI-ranked keyword suggestions sized for Adobe Stock.',
    cost: 1,
  },
  'ai-eps-to-jpg': {
    title: 'AI/EPS to JPG',
    desc: 'Convert vector (AI/EPS/SVG) to raster JPG.',
    cost: 0,
  },
  'halftone-studio': {
    title: 'Halftone Studio',
    desc: 'Apply a halftone-dot filter to an image.',
    cost: 1,
  },
  'dither-studio': {
    title: 'Dither Studio',
    desc: 'Apply dithering effects (Floyd-Steinberg, ordered).',
    cost: 1,
  },
  'image-to-psd': {
    title: 'Image to PSD',
    desc: 'Convert a flat image into a layered PSD.',
    cost: 1,
  },
  'keyword-clustering': {
    title: 'Keyword Clustering',
    desc: 'Group overlapping keywords into themes.',
    cost: 1,
  },
  'title-ab': { title: 'Title A/B', desc: 'Generate title variants and compare SEO fit.', cost: 1 },
  'alt-text': { title: 'Alt Text', desc: 'Write accessible alt text for your images.', cost: 1 },
  'keyword-density': {
    title: 'Keyword Density',
    desc: 'Check keyword usage across a listing.',
    cost: 1,
  },
  'contrast-checker': {
    title: 'Contrast Checker',
    desc: 'Verify text/background contrast.',
    cost: 1,
  },
  'batch-export': { title: 'Batch Export', desc: 'Export metadata in CSV / JSON.', cost: 0 },
  'adobe-analytics': {
    title: 'Adobe Analytics',
    desc: 'Query Adobe Stock performance data.',
    cost: 0,
  },
};

export function isToolSlug(s: string): s is ToolSlug {
  return (TOOL_SLUGS as readonly string[]).includes(s);
}
