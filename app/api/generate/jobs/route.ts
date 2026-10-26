import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 20;

/**
 * List endpoint for the dashboard History page — the current user's
 * generation jobs (metadata batches + image-to-prompt), newest first.
 *
 * The full per-image results stay behind `GET /api/generate/jobs/[jobId]`;
 * this endpoint only returns per-job summaries. Totals are derived from
 * `outputData` server-side (same derivation as the [jobId] poll route)
 * so the response never ships the — potentially 100-image — results
 * payload for 20 jobs at once.
 */
export async function GET(req: Request) {
  let user: Awaited<ReturnType<typeof requireApiUserOrKey>>;
  try {
    user = await requireApiUserOrKey(req, 'tools:run');
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawPage = Number.parseInt(url.searchParams.get('page') || '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const where = { userId: user.id };
  const [total, jobs] = await Promise.all([
    prisma.toolJob.count({ where }),
    prisma.toolJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const summaries = jobs.map((job) => {
    const output: any = job.outputData ?? {};
    const results: any[] = Array.isArray(output.results) ? output.results : [];
    const finished = job.status === 'COMPLETE' || job.status === 'FAILED';

    const succeeded =
      finished && typeof output.succeeded === 'number'
        ? output.succeeded
        : results.filter((r) => r.status === 'complete').length;
    const failed =
      finished && typeof output.failed === 'number'
        ? output.failed
        : results.filter((r) => r.status === 'failed').length;
    const inputCount = Array.isArray(job.inputFileUrls) ? job.inputFileUrls.length : 0;
    const images = results.length > 0 ? results.length : Math.max(inputCount, succeeded + failed);

    return {
      id: job.id,
      tool: job.toolSlug,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      totals: {
        total: images,
        succeeded,
        failed,
        refunded: typeof output.refunded === 'number' ? output.refunded : 0,
      },
    };
  });

  return NextResponse.json({
    jobs: summaries,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
