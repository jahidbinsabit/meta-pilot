import { prisma } from '@/lib/db';
import { revalidateTag, unstable_cache } from 'next/cache';
import type { GeneratorSettings } from '@/lib/generator/types';

const DEFAULT_ID = 'default';

function normalize(raw: any): GeneratorSettings {
  return {
    titleLength: raw?.titleLength ?? 60,
    titleMin: raw?.titleMin ?? 20,
    titleMax: raw?.titleMax ?? 120,
    descriptionLength: raw?.descriptionLength ?? 180,
    includeDescription:
      raw?.includeDescription !== undefined ? Boolean(raw.includeDescription) : true,
    keywordsCount: raw?.keywordsCount ?? 12,
    keywordsMin: raw?.keywordsMin ?? 5,
    keywordsMax: raw?.keywordsMax ?? 49,
    prefix: raw?.prefix ?? '',
    suffix: raw?.suffix ?? '',
    negativeTitleWords: Array.isArray(raw?.negativeTitleWords) ? raw.negativeTitleWords : [],
    negativeKeywords: Array.isArray(raw?.negativeKeywords) ? raw.negativeKeywords : [],
    defaultPrefix: raw?.defaultPrefix ?? '',
    defaultSuffix: raw?.defaultSuffix ?? '',
  };
}

/**
 * Returns the single-row generator settings snapshot, creating the
 * default row if it does not exist yet (idempotent, safe to call from UI).
 *
 * Cached for 60s — this is global config read on every generate page load
 * and every batch API call, so it must not hit the DB per request.
 */
export const getGeneratorSettings = unstable_cache(
  async (): Promise<GeneratorSettings> => {
    const row = await prisma.generatorSettings.findUnique({ where: { id: DEFAULT_ID } });
    if (!row) {
      const created = await prisma.generatorSettings.create({ data: { id: DEFAULT_ID } });
      return normalize(created);
    }
    return normalize(row);
  },
  ['generator-settings-default'],
  { revalidate: 60, tags: ['generator-settings'] },
);

/** Admin-only write. Updates the global generator defaults. */
function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
