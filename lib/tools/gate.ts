/**
 * Tool run gate (R9 B9-05 / B9-06 / S9-01).
 *
 * Until now the registry's `isEnabled` flag and per-tool
 * `enabledForTiers` list were display-only: the dashboard hid disabled
 * tools and the tool page 404'd, but every run/generate API executed
 * any slug directly (and charged for it). This module is the single
 * server-side switch the run paths consult BEFORE any compute or
 * charge:
 *
 * - A tool whose registry row says `isEnabled === false` is refused
 *   for everyone (admins included — disabling is the owner's kill
 *   switch for a broken or abusing tool).
 * - A tool with a non-empty `enabledForTiers` list is refused for
 *   users whose resolved tier is not in the list. An empty/null list
 *   means "all tiers" — which is what every production row carries
 *   today, so wiring this in changes nothing until an admin actually
 *   sets a list. ADMIN role bypasses the tier list (never the kill
 *   switch).
 *
 * Unknown slugs return null (not an error): callers keep their own
 * "unknown tool" handling and error shape.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTool, type ToolEntry } from '@/lib/tools/registry';
import { getActiveMembership } from '@/lib/plans/membership';

/** The registry says this tool is turned off. Maps to 403 tool_disabled. */
export class ToolDisabledError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`tool_disabled: ${slug}`);
    this.name = 'ToolDisabledError';
    this.slug = slug;
  }
}

/** The tool exists but the user's tier is not on its allow-list. */
export class ToolTierRequiredError extends Error {
  readonly slug: string;
  readonly requiredTiers: string[];
  constructor(slug: string, requiredTiers: string[]) {
    super(`tier_required: ${slug}`);
    this.name = 'ToolTierRequiredError';
    this.slug = slug;
    this.requiredTiers = requiredTiers;
  }
}

/**
 * Pure tier predicate: a null/empty allow-list allows every tier;
 * otherwise the tier must appear in the list (compared
 * case-insensitively — admin-entered values and plan tiers have not
 * always agreed on casing).
 */
export function tierAllowedForTool(
  enabledForTiers: string[] | null | undefined,
  tier: string,
): boolean {
  if (!enabledForTiers || enabledForTiers.length === 0) return true;
  const wanted = tier.toUpperCase();
  return enabledForTiers.some((t) => typeof t === 'string' && t.toUpperCase() === wanted);
}

/**
 * The user's effective tier: the ACTIVE membership's Plan tier wins
 * (resolved expiry-aware via lib/plans/membership, so an expired plan
 * no longer confers its tier); users with no live membership row fall
 * back to their `User.membership` enum, then FREE. Mirrors the
 * resolution order in lib/adobe-analytics/tiers.ts.
 */
export async function resolveUserTier(userId: string): Promise<string> {
  const membership = await getActiveMembership(userId);
  if (membership?.plan) return membership.plan.tier;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { membership: true },
  });
  return user?.membership || 'FREE';
}

/**
 * Assert that `slug` may execute for `user` right now. Returns the
 * resolved registry entry (null for an unknown slug — the caller's
 * own unknown-tool path applies). Throws ToolDisabledError /
 * ToolTierRequiredError; map them with toolGateErrorResponse().
 */
export async function assertToolRunnable(
  slug: string,
  user: { id: string; role: string },
): Promise<ToolEntry | null> {
  const tool = await getTool(slug);
  if (!tool) return null;
  if (!tool.isEnabled) throw new ToolDisabledError(slug);
  if (user.role !== 'ADMIN' && tool.enabledForTiers && tool.enabledForTiers.length > 0) {
    const tier = await resolveUserTier(user.id);
    if (!tierAllowedForTool(tool.enabledForTiers, tier)) {
      throw new ToolTierRequiredError(slug, tool.enabledForTiers);
    }
  }
  return tool;
}

/**
 * Map a gate error to the run routes' JSON error shape; returns null
 * for anything else so callers can rethrow.
 */
export function toolGateErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof ToolDisabledError) {
    return NextResponse.json({ error: 'tool_disabled', slug: e.slug }, { status: 403 });
  }
  if (e instanceof ToolTierRequiredError) {
    return NextResponse.json(
      { error: 'tier_required', slug: e.slug, requiredTiers: e.requiredTiers },
      { status: 403 },
    );
  }
  return null;
}
