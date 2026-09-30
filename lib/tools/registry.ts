/**
 * Tool registry helpers (PROMPT 9.7 / PROMPT 10).
 *
 * Reads the admin-configurable `ToolRegistry` table so the "All Tools
 * Collection" grid, the per-plan feature gates, and the credit cost all
 * follow a single source of truth. Falls back to the static `TOOL_META`
 * map when no row exists yet (e.g. before the seed has run).
 */

import { prisma } from '@/lib/db';
import { TOOL_SLUGS, TOOL_META, type ToolSlug } from '@/lib/tools/slugs';

export interface ToolEntry {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  route: string;
  creditCost: number;
  isFree: boolean;
  isEnabled: boolean;
  enabledForTiers: string[] | null;
  sortOrder: number;
}

/** Default metadata for every slug, used as a fallback before seeding. */
const DEFAULT_CATEGORIES: Record<string, string> = {
  'metadata-generator': 'conversion',
  'image-to-prompt': 'conversion',
  'bg-remover': 'creative',
  'bento-builder': 'creative',
  palette: 'creative',
  'ascii-vision': 'creative',
  events: 'utility',
  'adobe-keywords': 'conversion',
  'ai-eps-to-jpg': 'utility',
  'halftone-studio': 'creative',
  'dither-studio': 'creative',
  'image-to-psd': 'creative',
  'keyword-clustering': 'utility',
  'title-ab': 'utility',
  'alt-text': 'utility',
  'keyword-density': 'utility',
  'contrast-checker': 'utility',
  'batch-export': 'utility',
  'adobe-analytics': 'analytics',
};

const DEFAULT_ROUTES: Record<string, string> = {
  'metadata-generator': '/dashboard/generator',
  'image-to-prompt': '/dashboard/image-to-prompt',
  'bg-remover': '/dashboard/tools/bg-remover',
  'bento-builder': '/dashboard/tools/bento-builder',
  palette: '/dashboard/tools/palette',
  'ascii-vision': '/dashboard/tools/ascii-vision',
  events: '/dashboard/tools/events',
  'adobe-keywords': '/dashboard/tools/adobe-keywords',
  'ai-eps-to-jpg': '/dashboard/tools/ai-eps-to-jpg',
  'halftone-studio': '/dashboard/tools/halftone-studio',
  'dither-studio': '/dashboard/tools/dither-studio',
  'image-to-psd': '/dashboard/tools/image-to-psd',
  'keyword-clustering': '/dashboard/tools/keyword-clustering',
  'title-ab': '/dashboard/tools/title-ab',
  'alt-text': '/dashboard/tools/alt-text',
  'keyword-density': '/dashboard/tools/keyword-density',
  'contrast-checker': '/dashboard/tools/contrast-checker',
  'batch-export': '/dashboard/tools/batch-export',
  'adobe-analytics': '/dashboard/adobe-analytics',
};

function defaults(slug: string): Omit<ToolEntry, 'slug'> {
  const meta = TOOL_META[slug as ToolSlug] ?? { title: slug, desc: '', cost: 1 };
  return {
    name: meta.title,
    description: meta.desc,
    icon: 'Wrench',
    category: DEFAULT_CATEGORIES[slug] ?? 'utility',
    route: DEFAULT_ROUTES[slug] ?? `/dashboard/tools/${slug}`,
    creditCost: meta.cost,
    isFree: meta.cost === 0,
    isEnabled: true,
    enabledForTiers: null,
    sortOrder: 0,
  };
}

function rowToEntry(r: any): ToolEntry {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon,
    category: r.category,
    route: r.route,
    creditCost: r.creditCost,
    isFree: r.isFree,
    isEnabled: r.isEnabled,
    enabledForTiers: r.enabledForTiers,
    sortOrder: r.sortOrder,
  };
}

/** Read every registered tool, merged with defaults for any missing slug. */
export async function listTools(): Promise<ToolEntry[]> {
  const rows = await prisma.toolRegistry.findMany({ orderBy: { sortOrder: 'asc' } });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const out: ToolEntry[] = [];
  for (const slug of TOOL_SLUGS) {
    const row = bySlug.get(slug);
    out.push(row ? rowToEntry(row) : { slug, ...defaults(slug) });
  }
  return out;
}

/** Read a single tool by slug, falling back to defaults. */
export async function getTool(slug: string): Promise<ToolEntry | null> {
  const row = await prisma.toolRegistry.findUnique({ where: { slug } });
  if (row) return rowToEntry(row);
  if ((TOOL_SLUGS as readonly string[]).includes(slug)) {
    return { slug, ...defaults(slug) };
  }
  return null;
}

/** Whether a tool is visible for the given user's plan tier. */
export function toolVisibleFor(tool: ToolEntry, tier: string): boolean {
  if (!tool.isEnabled) return false;
  const tiers = tool.enabledForTiers;
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return true;
  return tiers.includes(tier);
}

/** Upsert a tool registry row, applying defaults for any unset fields. */
export async function upsertTool(
  slug: string,
  patch: Partial<Omit<ToolEntry, 'slug'>>,
): Promise<ToolEntry> {
  const base = defaults(slug);
  const data: any = {
    slug,
    name: patch.name ?? base.name,
    description: patch.description ?? base.description,
    icon: patch.icon ?? base.icon,
    category: patch.category ?? base.category,
    route: patch.route ?? base.route,
    creditCost: patch.creditCost ?? base.creditCost,
    isFree: patch.isFree ?? base.isFree,
    isEnabled: patch.isEnabled ?? base.isEnabled,
    enabledForTiers: patch.enabledForTiers ?? base.enabledForTiers,
    sortOrder: patch.sortOrder ?? base.sortOrder,
  };
  const row = await prisma.toolRegistry.upsert({
    where: { slug },
    update: data,
    create: data,
  });
  return rowToEntry(row);
}

/** Seed every canonical slug with defaults (idempotent). */
export async function seedToolRegistry(): Promise<number> {
  let n = 0;
  for (const slug of TOOL_SLUGS) {
    const existing = await prisma.toolRegistry.findUnique({ where: { slug } });
    if (!existing) {
      const d = defaults(slug);
      await prisma.toolRegistry.create({
        data: {
          slug,
          name: d.name,
          description: d.description,
          icon: d.icon,
          category: d.category,
          route: d.route,
          creditCost: d.creditCost,
          isFree: d.isFree,
          isEnabled: d.isEnabled,
          enabledForTiers: d.enabledForTiers as any,
          sortOrder: d.sortOrder,
        },
      });
      n++;
    }
  }
  return n;
}
