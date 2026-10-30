import { prisma } from '@/lib/db';
import { TOOL_META, type ToolSlug } from '@/lib/tools/slugs';

/**
 * Cost estimation for a metadata generation run.
 * Reads the active provider config from the DB so the price follows the
 * admin-controlled model/cost settings — no env hardcoding.
 */
/** Flat per-image fee when provider cost can't be computed (fallback). */
export const FLAT_METADATA_FEE = 1;

/**
 * Admin-configurable credit cost per tool slug (PROMPT 7).
 * Reads the `ToolCreditCost` table; falls back to the default cost in TOOL_META
 * when no row exists or the tool is inactive.
 */
// Tiny 30s TTL cache, keyed by tool slug (per-process, best-effort).
// Disabled under the test runner, where per-test Prisma mocks must stay
// authoritative across calls.
const CACHE_TTL_MS = 30_000;
const CACHE_ENABLED = process.env.NODE_ENV !== 'test';
const toolCostCache = new Map<string, { value: number; expiresAt: number }>();

export async function getToolCost(toolSlug: string): Promise<number> {
  // Cached per slug for 30s — a batch of N images would otherwise re-query
  // the DB N times; admin cost changes take effect within 30s.
  if (CACHE_ENABLED) {
    const hit = toolCostCache.get(toolSlug);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }
  const row = await prisma.toolCreditCost.findUnique({ where: { toolSlug } });
  const value =
    row && row.isActive
      ? Math.max(0, row.cost)
      : (TOOL_META[toolSlug as ToolSlug]?.cost ?? 1);
  if (CACHE_ENABLED) {
    toolCostCache.set(toolSlug, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return value;
}
