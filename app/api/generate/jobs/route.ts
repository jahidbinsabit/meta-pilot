import { NextResponse } from 'next/server';
import { Prisma, type JobStatus } from '@prisma/client';
import { requireApiUserOrKey } from '@/lib/api/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 20;

/**
 * One History summary row, projected by Postgres. The counts that used
 * to be derived in JS from the full `outputData` blob are extracted
 * from the JSON inside the query instead (R9 H4), so the list query
 * moves only these lightweight fields per job — never the up-to-100-
 * image results payload, which the old findMany pulled into Node for
 * all 20 rows on every page load (and the page auto-refreshes).
 */
interface JobSummaryRow {
  id: string;
  toolSlug: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  inputCount: number;
  resultsLength: number;
  completeCount: number;
  failedCount: number;
  storedSucceeded: number | null;
  storedFailed: number | null;
  refunded: number;
  platform: string | null;
  resultsExpired: boolean;
}

/**
 * List endpoint for the dashboard History page — the current user's
 * generation jobs (metadata batches + image-to-prompt), newest first.
 *
 * The full per-image results stay behind `GET /api/generate/jobs/[jobId]`;
 * this endpoint only returns per-job summaries. The summary fields are
 * computed from `outputData` INSIDE Postgres (same derivation as the
 * [jobId] poll route) so neither the response nor the DB→app transfer
 * ever carries the — potentially 100-image — results payload.
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

  // T2-12: History filters. Both params are allow-listed (the values map
  // onto indexed columns) — anything else is ignored, never interpolated.
  const toolParam = url.searchParams.get('tool');
  const tool = toolParam === 'metadata-generator' || toolParam === 'image-to-prompt' ? toolParam : null;
  const statusParam = url.searchParams.get('status');
  const status: JobStatus | null =
    statusParam === 'QUEUED' || statusParam === 'PROCESSING' || statusParam === 'COMPLETE' || statusParam === 'FAILED'
      ? statusParam
      : null;

  const where = {
    userId: user.id,
    ...(tool ? { toolSlug: tool } : {}),
    ...(status ? { status } : {}),
  };
  const toolFilter = tool ? Prisma.sql`AND j."toolSlug" = ${tool}` : Prisma.empty;
  const statusFilter = status ? Prisma.sql`AND j."status" = ${status}::"JobStatus"` : Prisma.empty;
  const [total, rows] = await Promise.all([
    prisma.toolJob.count({ where }),
    prisma.$queryRaw<JobSummaryRow[]>`
      SELECT
        j."id",
        j."toolSlug",
        j."status"::text AS "status",
        j."createdAt",
        j."completedAt",
        CASE WHEN jsonb_typeof(j."inputFileUrls") = 'array'
             THEN jsonb_array_length(j."inputFileUrls") ELSE 0 END AS "inputCount",
        CASE WHEN jsonb_typeof(j."outputData" -> 'results') = 'array'
             THEN jsonb_array_length(j."outputData" -> 'results') ELSE 0 END AS "resultsLength",
        (SELECT COUNT(*)::int FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(j."outputData" -> 'results') = 'array'
                THEN j."outputData" -> 'results' ELSE '[]'::jsonb END
         ) AS e WHERE e ->> 'status' = 'complete') AS "completeCount",
        (SELECT COUNT(*)::int FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(j."outputData" -> 'results') = 'array'
                THEN j."outputData" -> 'results' ELSE '[]'::jsonb END
         ) AS e WHERE e ->> 'status' = 'failed') AS "failedCount",
        CASE WHEN j."outputData" ->> 'succeeded' ~ '^-?[0-9]+$'
             THEN (j."outputData" ->> 'succeeded')::int ELSE NULL END AS "storedSucceeded",
        CASE WHEN j."outputData" ->> 'failed' ~ '^-?[0-9]+$'
             THEN (j."outputData" ->> 'failed')::int ELSE NULL END AS "storedFailed",
        CASE WHEN j."outputData" ->> 'refunded' ~ '^-?[0-9]+$'
             THEN (j."outputData" ->> 'refunded')::int ELSE 0 END AS "refunded",
        j."outputData" ->> 'platform' AS "platform",
        COALESCE(j."outputData" ->> 'resultsExpired' = 'true', false) AS "resultsExpired"
      FROM "ToolJob" AS j
      WHERE j."userId" = ${user.id} ${toolFilter} ${statusFilter}
      ORDER BY j."createdAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `,
  ]);

  const summaries = rows.map((row) => {
    const finished = row.status === 'COMPLETE' || row.status === 'FAILED';

    const succeeded =
      finished && row.storedSucceeded !== null ? row.storedSucceeded : row.completeCount;
    const failed =
      finished && row.storedFailed !== null ? row.storedFailed : row.failedCount;
    // R7-11: prefer the job's true input total. The image-prompt runner
    // appends results incrementally, so `resultsLength` alone undercounts
    // a running job (3 of 10 done would read as "3 images" in History).
    // The [jobId] poll route reports the same succeeded/failed derivation
    // below; this makes the total agree with it.
    const images = Math.max(row.inputCount, row.resultsLength);

    // The platform the batch was generated for (outputData.platform,
    // written by the runners) — History needs it to re-export the job in
    // the platform's own CSV format. Null for legacy jobs that predate it.
    const platform =
      typeof row.platform === 'string' &&
      ['adobe', 'shutterstock', 'freepik', 'vecteezy', 'istock', 'generic'].includes(
        row.platform,
      )
        ? row.platform
        : null;

    return {
      id: row.id,
      tool: row.toolSlug,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      platform,
      // Set by the cleanup cron's payload retention (90 days): the row
      // and its counts stay, the per-image results are gone.
      resultsExpired: row.resultsExpired === true,
      totals: {
        total: images,
        succeeded,
        failed,
        refunded: row.refunded,
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
