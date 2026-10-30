import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { upsertTool, type ToolEntry } from '@/lib/tools/registry';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Admin: bulk-save the tool registry (PROMPT 9.7).
 *
 * Accepts the full list of tool rows and upserts each one. Every write is
 * audit-logged so the admin can see who changed what.
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiAdmin(req);

    const body = await req.json();
    const tools: ToolEntry[] = body.tools;
    if (!Array.isArray(tools)) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    for (const t of tools) {
      await upsertTool(t.slug, {
        name: t.name,
        description: t.description,
        icon: t.icon,
        category: t.category,
        route: t.route,
        creditCost: t.creditCost,
        isFree: t.isFree,
        isEnabled: t.isEnabled,
        enabledForTiers: t.enabledForTiers,
        sortOrder: t.sortOrder,
      });

      // Charging reads the separate ToolCreditCost table (lib/credits/cost.ts
      // getToolCost, TOOL_META fallback) — the registry row alone never
      // changed what users are charged. Mirror the editor's cost (and the
      // enabled toggle) into ToolCreditCost so admin edits take effect.
      const cost = Math.max(0, Math.trunc(Number(t.creditCost) || 0));
      await prisma.toolCreditCost.upsert({
        where: { toolSlug: t.slug },
        create: { toolSlug: t.slug, cost, isActive: t.isEnabled !== false },
        update: { cost, isActive: t.isEnabled !== false },
      });
    }

    await writeAudit({
      adminId: user.id,
      action: 'update_tool_registry',
      targetType: 'ToolRegistry',
      targetId: 'bulk',
      after: { count: tools.length },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // T4-65: the catch-all mapped even auth failures to a 500 — map them
    // like the sibling admin routes (401/403) and reserve 500 for faults.
    if (e?.message === 'UNAUTHORIZED' || e?.message === 'FORBIDDEN') {
      return new Response(JSON.stringify({ error: e.message.toLowerCase() }), {
        status: e.message === 'FORBIDDEN' ? 403 : 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('admin tools save failed', e);
    return new Response(JSON.stringify({ error: 'save_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
