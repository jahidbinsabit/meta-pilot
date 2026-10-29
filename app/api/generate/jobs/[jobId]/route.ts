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
 *
 * `?known=<n>` (R9 H3): the client reports how many FINISHED entries
 * (status complete/failed) it has already incorporated from earlier
 * polls. Result entries are monotonic — a finished entry never
 * changes again, and unfinished entries carry nothing the client
 * renders — so when the job's finished count still equals `known`,
 * nothing the client displays can have changed, and the response is
 * a compact payload (status + counts, `unchanged: true`) WITHOUT the
 * results array. That breaks the old O(n²) pattern of re-shipping the
 * whole cumulative results array (~125 KB+ on a 100-image job) every
 * 2.5 s per tab. Any finished-count change — including the terminal
 * write — returns the full payload exactly as before, so failed
 * entries and final results always arrive intact. For append-only
 * image-prompt jobs every entry is finished on arrival, so `known`
 * there is simply the results length the client already holds.
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

  const scalars = {
    status: job.status,
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
  };

  const knownRaw = Number.parseInt(new URL(req.url).searchParams.get('known') ?? '', 10);
  const known = Number.isFinite(knownRaw) && knownRaw >= 0 ? knownRaw : null;
  if (known !== null && known === succeeded + failed) {
    return NextResponse.json({ id: job.id, ...scalars, unchanged: true });
  }

  return NextResponse.json({
    ...scalars,
    results,
  });
}
