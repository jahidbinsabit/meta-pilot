import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
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
    const user = await requireApiUser(req);
    if (user.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
    console.error('admin tools save failed', e);
    return new Response(JSON.stringify({ error: e?.message || 'save_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
