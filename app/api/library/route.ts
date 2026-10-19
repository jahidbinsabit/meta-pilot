import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/library — paginated generation history for the current user.
 * Merges GeneratedMetadata rows and ToolJob rows into a unified feed,
 * newest first.
 *
 * Query params: page (default 1), take (default 20, max 100), type (all|metadata|tools)
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(url.searchParams.get('take') || '20', 10) || 20));
    const type = url.searchParams.get('type') || 'all';
    const skip = (page - 1) * take;

    // Fetch a bit extra from each source so the merged feed stays full.
    const [metadata, jobs, metaCount, jobsCount] = await Promise.all([
      type === 'tools'
        ? []
        : prisma.generatedMetadata.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: take + 1,
            skip,
            select: {
              id: true,
              title: true,
              description: true,
              keywords: true,
              provider: true,
              model: true,
              originalName: true,
              createdAt: true,
            },
          }),
      type === 'metadata'
        ? []
        : prisma.toolJob.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: take + 1,
            skip,
            select: {
              id: true,
              toolSlug: true,
              status: true,
              outputData: true,
              creditsCharged: true,
              createdAt: true,
              completedAt: true,
            },
          }),
      type === 'tools' ? 0 : prisma.generatedMetadata.count({ where: { userId: user.id } }),
      type === 'metadata' ? 0 : prisma.toolJob.count({ where: { userId: user.id } }),
    ]);

    const items = [
      ...metadata.map((m) => ({
        kind: 'metadata' as const,
        id: m.id,
        title: m.title,
        subtitle: m.keywords.slice(0, 5).join(', '),
        provider: m.provider,
        model: m.model,
        fileName: m.originalName,
        createdAt: m.createdAt,
        data: m,
      })),
      ...jobs.map((j) => ({
        kind: 'tool' as const,
        id: j.id,
        title: j.toolSlug,
        subtitle: j.status,
        provider: null as string | null,
        model: null as string | null,
        fileName: null as string | null,
        createdAt: j.createdAt,
        data: { ...j, outputData: undefined },
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take);

    const total = metaCount + jobsCount;
    return NextResponse.json({
      items,
      page,
      take,
      total,
      totalPages: Math.ceil(total / take),
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    console.error('library fetch failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** DELETE /api/library — delete one history item (metadata or tool job). */
export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser(req);
    const { id, kind } = await req.json();
    if (!id || (kind !== 'metadata' && kind !== 'tool')) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    if (kind === 'metadata') {
      const row = await prisma.generatedMetadata.findFirst({ where: { id, userId: user.id } });
      if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await prisma.generatedMetadata.delete({ where: { id } });
    } else {
      const row = await prisma.toolJob.findFirst({ where: { id, userId: user.id } });
      if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await prisma.toolJob.delete({ where: { id } });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    console.error('library delete failed', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
