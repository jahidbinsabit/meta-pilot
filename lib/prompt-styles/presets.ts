import { prisma } from '@/lib/db';
import type { PromptStylePreset, PromptStylePresetInput } from '@/lib/prompt-styles/types';

/**
 * Prompt Style presets for the Image → Prompt tool (PROMPT 5).
 *
 * Each preset maps a user-facing label to the system instruction sent to the
 * AI provider. The list is admin-configurable and read from the DB on every
 * request, so admins can change or retire presets without a redeploy.
 */

/** Seeded on first read. Kept here so a fresh DB still has a usable dropdown. */
const DEFAULT_PRESETS: PromptStylePresetInput[] = [
  {
    slug: 'descriptive',
    label: 'Descriptive',
    systemInstruction:
      'You are an expert image analyst. Write a clear, literal description of what the image shows, in natural prose. Prioritise accuracy over flourish — no marketing adjectives, no interpretation, no invented details.',
    sortOrder: 0,
    isActive: true,
  },
  {
    slug: 'midjourney',
    label: 'Midjourney-style tags',
    systemInstruction:
      'You write prompts for Midjourney. Produce a single comma-separated tag string using the vocabulary a generative image model expects: subject, then medium, then style, then lighting, then composition and camera, then colour palette, then mood and atmosphere. Order the tags from most to least important. Use vivid, weighty nouns and adjectives. Do not use full sentences or conjunctions.',
    sortOrder: 1,
    isActive: true,
  },
  {
    slug: 'stable-diffusion',
    label: 'Stable Diffusion tags',
    systemInstruction:
      'You write prompts for Stable Diffusion. Produce a single comma-separated tag list of short lowercase keyword phrases, ordered by influence. Prefer concrete visual tokens over prose, use weighted emphasis like (key:1.2) on the two or three most important elements, and avoid filler words.',
    sortOrder: 2,
    isActive: true,
  },
  {
    slug: 'cinematic',
    label: 'Cinematic',
    systemInstruction:
      'You are a film stills director describing a frame. Write a single evocative prompt that reads like a shot description: name the camera movement, lens, aspect ratio, lighting setup and colour grade, then the subject blocking and the emotional beat. Use cinematic terminology — anamorphic, rim light, volumetric haze, shallow depth of field — matched to what the image actually shows.',
    sortOrder: 3,
    isActive: true,
  },
];

function normalize(row: any): PromptStylePreset {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    systemInstruction: row.systemInstruction,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

/**
 * Creates the default presets when the table is empty. Idempotent and safe to
 * call from any read path — it only writes when nothing exists, so it never
 * overwrites admin edits. Mirrors how `getGeneratorSettings` creates its row.
 */
async function ensureSeeded(): Promise<void> {
  const count = await prisma.promptStylePreset.count();
  if (count > 0) return;
  await prisma.promptStylePreset.createMany({
    data: DEFAULT_PRESETS,
    skipDuplicates: true,
  });
}

/** Active presets for the dashboard dropdown, in display order. */
export async function listActivePresets(): Promise<PromptStylePreset[]> {
  await ensureSeeded();
  const rows = await prisma.promptStylePreset.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  return rows.map(normalize);
}

/** Every preset, active or not — for the admin editor. */
export async function listAllPresets(): Promise<PromptStylePreset[]> {
  await ensureSeeded();
  const rows = await prisma.promptStylePreset.findMany({
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  return rows.map(normalize);
}

/**
 * Resolves one preset by slug. Returns null for unknown or inactive slugs so
 * callers can reject a stale/disabled selection rather than running the model
 * with a caller-supplied system instruction.
 */
export async function getPresetBySlug(slug: string): Promise<PromptStylePreset | null> {
  const row = await prisma.promptStylePreset.findUnique({ where: { slug } });
  if (!row || !row.isActive) return null;
  return normalize(row);
}

/** Admin-only write. Upserts by slug and records an audit-log entry. */
export async function upsertPreset(
  patch: Partial<PromptStylePresetInput> & { slug: string },
  adminId: string,
): Promise<PromptStylePreset> {
  const before = await prisma.promptStylePreset.findUnique({ where: { slug: patch.slug } });

  const after = await prisma.promptStylePreset.upsert({
    where: { slug: patch.slug },
    update: {
      label: patch.label ?? undefined,
      systemInstruction: patch.systemInstruction ?? undefined,
      sortOrder: patch.sortOrder ?? undefined,
      isActive: patch.isActive ?? undefined,
    },
    create: {
      slug: patch.slug,
      label: patch.label || patch.slug,
      systemInstruction: patch.systemInstruction || '',
      sortOrder: patch.sortOrder ?? 0,
      isActive: patch.isActive ?? true,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId,
      action: before ? 'prompt_style_preset.update' : 'prompt_style_preset.create',
      targetType: 'PromptStylePreset',
      targetId: after.id,
      before: before ? (normalize(before) as any) : undefined,
      after: normalize(after) as any,
    },
  });

  return normalize(after);
}

/** Admin-only delete. Refuses to remove a preset that is the only active one,
 *  so the dashboard dropdown can never be left empty. */
export async function deletePreset(id: string, adminId: string): Promise<void> {
  const row = await prisma.promptStylePreset.findUnique({ where: { id } });
  if (!row) return;
  if (row.isActive) {
    const activeCount = await prisma.promptStylePreset.count({ where: { isActive: true } });
    if (activeCount <= 1) throw new Error('cannot_delete_last_active_preset');
  }
  await prisma.promptStylePreset.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      adminId,
      action: 'prompt_style_preset.delete',
      targetType: 'PromptStylePreset',
      targetId: id,
      before: normalize(row) as any,
    },
  });
}
