import { listTools } from '@/lib/tools/registry';
import { resolveUserTier, tierAllowedForTool } from '@/lib/tools/gate';
import { prisma } from '@/lib/db';
import getServerSession from '@/lib/server-session';
import { ToolsGrid, type ToolGridItem } from '@/components/dashboard/tools-grid';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

export default async function ToolsPage() {
  const [tools, session] = await Promise.all([listTools(), getServerSession()]);
  const email = session?.user?.email;
  const dbUser = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
    : null;
  const tier = dbUser ? await resolveUserTier(dbUser.id) : 'FREE';
  const isAdmin = dbUser?.role === 'ADMIN';

  // T3-09: disabled tools are no longer filtered out of the grid — the
  // header copy always said "locked, not broken", but the filter made
  // the locked tile unreachable. Tier-restricted tools (Batch C gate,
  // lib/tools/gate.ts) render locked too, mirroring what the run APIs
  // enforce server-side.
  const items: ToolGridItem[] = tools.map((tool) => {
    let locked: ToolGridItem['locked'] = null;
    if (!tool.isEnabled) {
      locked = 'disabled';
    } else if (!isAdmin && !tierAllowedForTool(tool.enabledForTiers, tier)) {
      locked = 'tier';
    }
    return {
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      icon: tool.icon,
      route: tool.route,
      isFree: tool.isFree,
      locked,
      requiredTiers: tool.enabledForTiers ?? undefined,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Tools</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          All Tools Collection
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every tool is a real, working page. Disabled tools are locked, not broken — and
          tools your plan doesn&apos;t include are shown locked too.
        </p>
      </div>

      <ToolsGrid tools={items} />
    </div>
  );
}
