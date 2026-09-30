import { prisma } from '@/lib/db';
import { TOOL_META, type ToolSlug } from '@/lib/tools/slugs';

/**
 * Cost estimation for a metadata generation run.
 * Reads the active provider config from the DB so the price follows the
 * admin-controlled model/cost settings — no env hardcoding.
 */
export async function estimateCostCents(opts: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<number> {
  const cfg = await prisma.aiProviderConfig.findUnique({ where: { provider: opts.provider } });
  if (!cfg) return 0;
  const inCost = (opts.promptTokens / 1000) * cfg.costPer1kIn;
  const outCost = (opts.completionTokens / 1000) * cfg.costPer1kOut;
  return Math.max(0, Math.round((inCost + outCost) * 100));
}

/** Flat per-image fee when provider cost can't be computed (fallback). */
export const FLAT_METADATA_FEE = 1;

/**
 * Admin-configurable credit cost per tool slug (PROMPT 7).
 * Reads the `ToolCreditCost` table; falls back to the default cost in TOOL_META
 * when no row exists or the tool is inactive.
 */
export async function getToolCost(toolSlug: string): Promise<number> {
  const row = await prisma.toolCreditCost.findUnique({ where: { toolSlug } });
  if (row && row.isActive) {
    return Math.max(0, row.cost);
  }
  return TOOL_META[toolSlug as ToolSlug]?.cost ?? 1;
}
