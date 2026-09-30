import { prisma } from '@/lib/db';
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
 */
export async function getGeneratorSettings(): Promise<GeneratorSettings> {
  const row = await prisma.generatorSettings.findUnique({ where: { id: DEFAULT_ID } });
  if (!row) {
    const created = await prisma.generatorSettings.create({ data: { id: DEFAULT_ID } });
    return normalize(created);
  }
  return normalize(row);
}

/** Admin-only write. Updates the global generator defaults. */
export async function updateGeneratorSettings(
  patch: Partial<GeneratorSettings>,
  adminId: string,
): Promise<GeneratorSettings> {
  const before = await getGeneratorSettings();
  const data: any = {};
  if (patch.titleLength !== undefined)
    data.titleLength = clampInt(patch.titleLength, before.titleMin, before.titleMax);
  if (patch.titleMin !== undefined) data.titleMin = Math.max(1, Math.floor(patch.titleMin));
  if (patch.titleMax !== undefined)
    data.titleMax = Math.max(data.titleMin ?? before.titleMin, Math.floor(patch.titleMax));
  if (patch.descriptionLength !== undefined)
    data.descriptionLength = Math.max(1, Math.floor(patch.descriptionLength));
  if (patch.includeDescription !== undefined)
    data.includeDescription = Boolean(patch.includeDescription);
  if (patch.keywordsCount !== undefined)
    data.keywordsCount = clampInt(patch.keywordsCount, before.keywordsMin, before.keywordsMax);
  if (patch.keywordsMin !== undefined)
    data.keywordsMin = Math.max(1, Math.floor(patch.keywordsMin));
  if (patch.keywordsMax !== undefined)
    data.keywordsMax = Math.max(
      data.keywordsMin ?? before.keywordsMin,
      Math.floor(patch.keywordsMax),
    );
  if (patch.prefix !== undefined) data.prefix = patch.prefix;
  if (patch.suffix !== undefined) data.suffix = patch.suffix;
  if (patch.defaultPrefix !== undefined) data.defaultPrefix = patch.defaultPrefix;
  if (patch.defaultSuffix !== undefined) data.defaultSuffix = patch.defaultSuffix;
  if (patch.negativeTitleWords !== undefined) data.negativeTitleWords = patch.negativeTitleWords;
  if (patch.negativeKeywords !== undefined) data.negativeKeywords = patch.negativeKeywords;

  const after = await prisma.generatorSettings.upsert({
    where: { id: DEFAULT_ID },
    update: data,
    create: { id: DEFAULT_ID, ...data },
  });

  await prisma.auditLog.create({
    data: {
      adminId,
      action: 'generator_settings.update',
      targetType: 'GeneratorSettings',
      targetId: DEFAULT_ID,
      before: before as any,
      after: normalize(after) as any,
    },
  });

  return normalize(after);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
