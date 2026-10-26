import { NextResponse } from 'next/server';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { getBalance } from '@/lib/credits/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Poll endpoint for background metadata batch jobs started via
 * `POST /api/generate/batch/start`. The runner writes incremental
 * results into the ToolJob's outputData after each group of 5 images,
 * so a poll returns finished entries plus 'processing' placeholders
 * for the rest.
 */
export async function GET(
  req: Request,
  { params }: { params: { jobId: string } },
) {
  let user: Awaited<ReturnType<typeof requireApiUserOrKey>>;
  try {
    user = await requireApiUserOrKey(req, 'tools:run');
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const job = await prisma.toolJob.findUnique({ where: { id: params.jobId } });
  if (!job) {
    return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  }
  if (job.userId !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

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

  return NextResponse.json({
    status: job.status,
    results,
    partial: typeof output.partial === 'boolean' ? output.partial : !finished,
    succeeded,
    failed,
    refunded: typeof output.refunded === 'number' ? output.refunded : 0,
    refundError: typeof output.refundError === 'string' ? output.refundError : null,
    balance:
      finished && typeof output.balance === 'number'
        ? output.balance
        : await getBalance(user.id),
    errorMessage: job.errorMessage ?? null,
  });
}
