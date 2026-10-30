import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { listFiles, deleteFile } from '@/lib/s3/client';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { refundCreditsOnce } from '@/lib/credits/engine';
import { purgeDeletedUsers } from '@/lib/account/purge';
import { rollupCompletedAiCallDays } from '@/lib/ai/rollup';

/**
 * Cleanup cron — deletes temporary uploads/previews older than 60 minutes,
 * reaps orphaned generation jobs, and runs the retention sweeps:
 * AiCallLog daily rollup (permanent per-day aggregates, run BEFORE the
 * purge so cost history survives it), AiCallLog purge (90d),
 * soft-deleted account purge (past their 30-day
 * deadline), ToolJob result-payload strip (90d — rows + counts stay for
 * History, the heavy per-image payload goes), ToolUsage prune (90d),
 * AuditLog prune (180d) and the membership expiry sweep (B9-01 — lapsed
 * 30-day plans flip ACTIVE → EXPIRED).
 *
 * Key patterns:  uploads/<userId>/<timestamp>-<filename>
 *                previews/<userId>/<timestamp>-<hex>-<filename>
 *
 * Called every 30 minutes from the VPS host crontab (see deploy-vps.sh).
 * Files are temporary by design — with the 60-minute TTL they live at
 * most ~90 minutes. (The TTL was 5 minutes, but long batches — 100
 * images on a free-tier key with 429 backoffs — can still be reading
 * their uploads/previews well past 5 minutes; deleting mid-batch failed
 * otherwise-fine jobs. Previews were previously never purged at all.)
 * GET /api/cron/cleanup-uploads
 */

const TTL_MS = 60 * 60 * 1000; // 60 minutes
const AI_LOG_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
// ToolJob rows are History's data and stay forever, but the per-image
// result payloads inside outputData (~50 KB for a 40-image job, ~85% of
// all DB growth) are stripped after this window; the cron marks the job
// `resultsExpired` and History shows an honest "results expired" state.
const JOB_PAYLOAD_RETENTION_DAYS = 90;
const JOB_PAYLOAD_BATCH_LIMIT = 200;
// ToolUsage rows are written per tool run and read by nothing — prune.
const TOOL_USAGE_RETENTION_DAYS = 90;
// AuditLog rows carry fat before/after snapshots; 180 days online is
// ample for an admin audit trail.
const AUDIT_LOG_RETENTION_DAYS = 180;
// A generation job with no heartbeat (or creation) for this long is
// orphaned — its detached runner died with the process (CQ-01: deploys
// restart the app container). Live runners rewrite the job's outputData
// after every group/image, refreshing `heartbeatAt`, so a live job never
// looks stale even when the batch itself runs longer than this.
const STALE_JOB_MS = 20 * 60 * 1000; // 20 minutes
const REAPER_BATCH_LIMIT = 100;

/** Delete every file under `prefix` whose embedded timestamp is past TTL. */
async function purgePrefix(
  prefix: string,
  cutoff: number,
): Promise<{ deleted: number; failed: number; skipped: number }> {
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  const files = await listFiles(prefix);

  for (const file of files) {
    // Key format: <prefix>/<userId>/<timestamp>-<name>
    const segments = file.key.split('/');
    const fileSegment = segments[2] ?? ''; // "<timestamp>-<name>"
    const tsStr = fileSegment.split('-')[0]; // "<timestamp>"
    const ts = Number(tsStr);

    if (!ts || isNaN(ts)) {
      skipped++;
      continue;
    }

    if (ts > cutoff) {
      skipped++;
      continue;
    }

    try {
      await deleteFile(file.key);
      deleted++;
    } catch (err) {
      console.error(`[cleanup] Failed to delete ${file.key}:`, err);
      failed++;
    }
  }

  return { deleted, failed, skipped };
}

/**
 * Stale-job reaper (CQ-01/CQ-02): a detached runner that dies mid-job
 * (deploy restart, OOM) leaves its ToolJob in QUEUED/PROCESSING forever
 * and its per-image refund never runs. This sweep claims such jobs
 * atomically, marks them FAILED, and refunds the images that never
 * completed via the idempotent `refundCreditsOnce` — so a runner that
 * turns out to be alive after all can neither double-refund nor have its
 * job reaped twice.
 *
 * Staleness: ToolJob has no `updatedAt` column, so the runners stamp
 * `outputData.heartbeatAt` on every progress write; jobs written before
 * heartbeats existed fall back to `createdAt`.
 */
async function reapStaleJobs(): Promise<{
  reaped: number;
  refundedCredits: number;
  refundFailed: number;
}> {
  let reaped = 0;
  let refundedCredits = 0;
  let refundFailed = 0;

  const staleBefore = new Date(Date.now() - STALE_JOB_MS);
  const candidates = await prisma.toolJob.findMany({
    where: {
      status: { in: ['QUEUED', 'PROCESSING'] },
      createdAt: { lt: staleBefore },
    },
    orderBy: { createdAt: 'asc' },
    take: REAPER_BATCH_LIMIT,
  });

  for (const job of candidates) {
    try {
      const output: any = (job.outputData as any) ?? {};

      // Liveness check: a fresh heartbeat means the runner is still
      // working (long batch) — leave the job alone.
      const heartbeatTs =
        typeof output.heartbeatAt === 'string' ? Date.parse(output.heartbeatAt) : NaN;
      const lastActivity = !isNaN(heartbeatTs) ? heartbeatTs : job.createdAt.getTime();
      if (lastActivity > Date.now() - STALE_JOB_MS) continue;

      const results: any[] = Array.isArray(output.results) ? output.results : [];
      const completeCount = results.filter((r) => r?.status === 'complete').length;
      // Total images in the job: the start routes store one inputFileUrls
      // entry per image (creation-time outputData.images is the fallback).
      const totalImages = Array.isArray(job.inputFileUrls)
        ? job.inputFileUrls.length
        : Array.isArray(output.images)
          ? output.images.length
          : 0;
      // Images absent from `results` entirely (image-prompt writes results
      // incrementally, so never-started images appear nowhere) also count
      // as not complete — hence the max() against the job's total.
      let notComplete = results.filter((r) => r?.status !== 'complete').length;
      if (totalImages > 0) {
        notComplete = Math.max(notComplete, totalImages - completeCount);
      }

      // Atomic claim: only the caller that flips the status owns the reap.
      const now = new Date();
      const claim = await prisma.toolJob.updateMany({
        where: { id: job.id, status: { in: ['QUEUED', 'PROCESSING'] } },
        data: { status: 'FAILED', completedAt: now },
      });
      if (claim.count !== 1) continue;
      reaped++;

      // Cost per image is derivable only from what the start route
      // actually charged: creditsCharged is the job total (images ×
      // per-image cost). creditsCharged === 0 means nothing was deducted
      // (unlimited mode / free tool) — no refund is owed. When the total
      // doesn't divide evenly by the image count the per-image cost
      // cannot be known, so the job is still failed but its refund is
      // skipped rather than guessed.
      let refundAmount = 0;
      let reaperNote: string | undefined;
      if (job.creditsCharged > 0) {
        if (totalImages > 0 && job.creditsCharged % totalImages === 0) {
          refundAmount = notComplete * (job.creditsCharged / totalImages);
        } else {
          reaperNote = 'reaper: per-image cost could not be derived — refund skipped';
        }
      }

      let paid = 0;
      let refundError: string | undefined;
      if (refundAmount > 0) {
        try {
          paid = await refundCreditsOnce(job.userId, refundAmount, job.id, 'stale_job_reaper');
          refundedCredits += paid;
        } catch (refundErr) {
          refundFailed++;
          refundError = 'refund_failed';
          console.error(`[cleanup-uploads] reaper refund failed for job ${job.id}:`, refundErr);
        }
      }

      await prisma.toolJob.update({
        where: { id: job.id },
        data: {
          outputData: {
            ...output,
            partial: false,
            succeeded: completeCount,
            failed: notComplete,
            refunded: (typeof output.refunded === 'number' ? output.refunded : 0) + paid,
            ...(refundError ? { refundError } : {}),
            ...(reaperNote ? { reaperNote } : {}),
            reapedAt: now.toISOString(),
          } as any,
          errorMessage:
            job.errorMessage ?? 'Generation timed out and was stopped automatically.',
        },
      });
    } catch (jobErr) {
      console.error(`[cleanup-uploads] reaper failed for job ${job.id}:`, jobErr);
    }
  }

  if (reaped > 0) {
    console.log(
      `[cleanup-uploads] reaped ${reaped} stale job(s) — refunded ${refundedCredits} credits, ${refundFailed} refund failure(s)`,
    );
  }
  return { reaped, refundedCredits, refundFailed };
}

/**
 * ToolJob payload retention: terminal jobs older than the window keep
 * their row and every summary field, but lose the heavy `results` array.
 *
 * Preserved verbatim from outputData: `platform`, `settings`, `partial`,
 * `succeeded`, `failed`, `refunded`, `refundError`, `balance`,
 * `heartbeatAt`, `reaperNote`, `reapedAt` (i.e. everything except
 * `results`). Both the History list and the [jobId] poll route derive a
 * finished job's counts from `succeeded`/`failed`, and the row's totals
 * come from the `inputFileUrls` column, so a stripped job still renders
 * correctly in History — only the per-image detail/download is gone,
 * which the added `resultsExpired` marker says honestly.
 */
async function stripExpiredJobPayloads(): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_PAYLOAD_RETENTION_DAYS * DAY_MS);
  const jobs = await prisma.toolJob.findMany({
    where: {
      status: { in: ['COMPLETE', 'FAILED'] },
      createdAt: { lt: cutoff },
      outputData: { not: Prisma.DbNull },
    },
    select: { id: true, outputData: true },
    orderBy: { createdAt: 'asc' },
    take: JOB_PAYLOAD_BATCH_LIMIT,
  });

  let stripped = 0;
  for (const job of jobs) {
    try {
      const output: any = job.outputData ?? {};
      if (output.resultsExpired === true) continue;
      if (!Array.isArray(output.results) || output.results.length === 0) continue;

      const next: any = { ...output };
      delete next.results;
      next.resultsExpired = true;
      next.resultsExpiredAt = new Date().toISOString();

      await prisma.toolJob.update({
        where: { id: job.id },
        data: { outputData: next },
      });
      stripped++;
    } catch (jobErr) {
      console.error(`[cleanup-uploads] payload strip failed for job ${job.id}:`, jobErr);
    }
  }

  if (stripped > 0) {
    console.log(
      `[cleanup-uploads] stripped result payloads from ${stripped} ToolJob(s) older than ${JOB_PAYLOAD_RETENTION_DAYS}d`,
    );
  }
  return stripped;
}

/**
 * Membership expiry sweep (B9-01): plan purchases are one-time 30-day
 * terms — flip every ACTIVE membership whose renewsAt has passed to
 * EXPIRED in one bulk update, then mirror the downgrade onto
 * `User.membership` ('FREE') for affected users left with no other live
 * membership (the lazy path in lib/plans/membership handles users who
 * hit a gate resolver first; this sweep catches everyone else). Cheap:
 * two indexed queries plus one small update per affected user.
 */
async function expireLapsedMemberships(): Promise<number> {
  const now = new Date();
  const lapsed = await prisma.membership.findMany({
    where: { status: 'ACTIVE', renewsAt: { lt: now } },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (lapsed.length === 0) return 0;

  const flipped = await prisma.membership.updateMany({
    where: { status: 'ACTIVE', renewsAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  for (const { userId } of lapsed) {
    const remaining = await prisma.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ renewsAt: null }, { renewsAt: { gt: now } }],
      },
      select: { id: true },
    });
    if (!remaining) {
      await prisma.user.update({
        where: { id: userId },
        data: { membership: 'FREE' },
      });
    }
  }

  if (flipped.count > 0) {
    console.log(`[cleanup-uploads] expired ${flipped.count} lapsed membership(s)`);
  }
  return flipped.count;
}

/** Constant-time secret comparison (length-checked; timingSafeEqual throws on length mismatch). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  // Auth: Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically
  // Also accept x-cron-secret for manual/external triggers
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  // Fail CLOSED: if no CRON_SECRET is configured, deny all requests.
  if (!expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  const validBearer = secretMatches(bearerToken, expectedSecret);
  const validHeader = secretMatches(cronSecret, expectedSecret);
  if (!validBearer && !validHeader) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = Date.now() - TTL_MS;

  try {
    // Reaper first (money correctness before file cleanup); its failure
    // must not block the purge below.
    let reaper = { reaped: 0, refundedCredits: 0, refundFailed: 0 };
    try {
      reaper = await reapStaleJobs();
    } catch (reaperErr) {
      console.error('[cleanup-uploads] stale-job reaper failed:', reaperErr);
    }

    const uploads = await purgePrefix('uploads/', cutoff);
    const previews = await purgePrefix('previews/', cutoff);

    console.log(
      `[cleanup-uploads] done — uploads deleted:${uploads.deleted} failed:${uploads.failed} skipped:${uploads.skipped}` +
        ` | previews deleted:${previews.deleted} failed:${previews.failed} skipped:${previews.skipped}`,
    );

    // AiCallLog daily rollup (audit R9, N2): aggregate every completed
    // Dhaka day into AiCallDailyRollup BEFORE the purge below deletes the
    // raw rows — the rollup is the only permanent AI cost history. Its
    // failure must never block the purge or the rest of the cron.
    let aiRollupDays = 0;
    try {
      aiRollupDays = await rollupCompletedAiCallDays();
      if (aiRollupDays > 0) {
        console.log(`[cleanup-uploads] rolled up ${aiRollupDays} AiCallLog day(s)`);
      }
    } catch (rollupErr) {
      console.error('[cleanup-uploads] AiCallLog rollup failed:', rollupErr);
    }

    // Retention: purge AiCallLog rows older than 90 days (write-only table,
    // one row per AI call — would grow unboundedly otherwise).
    let aiLogsPurged = 0;
    try {
      const cutoff = new Date(Date.now() - AI_LOG_RETENTION_DAYS * DAY_MS);
      const res = await prisma.aiCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      aiLogsPurged = res.count;
      if (aiLogsPurged > 0) {
        console.log(`[cleanup-uploads] purged ${aiLogsPurged} AiCallLog rows older than ${AI_LOG_RETENTION_DAYS}d`);
      }
    } catch (logErr) {
      console.error('[cleanup-uploads] AiCallLog purge failed:', logErr);
    }

    // Account purge: hard-delete soft-deleted users past their 30-day
    // deadline (see lib/account/purge.ts). Never throws.
    let accountPurge = { users: 0, filesDeleted: 0, failures: 0 };
    try {
      accountPurge = await purgeDeletedUsers();
    } catch (purgeErr) {
      console.error('[cleanup-uploads] account purge failed:', purgeErr);
    }

    // ToolJob payload retention (rows + counts stay; results go).
    let jobPayloadsStripped = 0;
    try {
      jobPayloadsStripped = await stripExpiredJobPayloads();
    } catch (stripErr) {
      console.error('[cleanup-uploads] ToolJob payload retention failed:', stripErr);
    }

    // ToolUsage prune: full results are stored per run and read by
    // nothing, so rows past the window are pure garbage.
    let toolUsagePruned = 0;
    try {
      const cutoff = new Date(Date.now() - TOOL_USAGE_RETENTION_DAYS * DAY_MS);
      const res = await prisma.toolUsage.deleteMany({ where: { createdAt: { lt: cutoff } } });
      toolUsagePruned = res.count;
      if (toolUsagePruned > 0) {
        console.log(`[cleanup-uploads] pruned ${toolUsagePruned} ToolUsage rows older than ${TOOL_USAGE_RETENTION_DAYS}d`);
      }
    } catch (usageErr) {
      console.error('[cleanup-uploads] ToolUsage prune failed:', usageErr);
    }

    // Membership expiry sweep (B9-01): lapsed 30-day plans → EXPIRED.
    let membershipsExpired = 0;
    try {
      membershipsExpired = await expireLapsedMemberships();
    } catch (expiryErr) {
      console.error('[cleanup-uploads] membership expiry sweep failed:', expiryErr);
    }

    // AuditLog prune: admin audit trail, bounded online retention.
    let auditLogsPruned = 0;
    try {
      const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * DAY_MS);
      const res = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      auditLogsPruned = res.count;
      if (auditLogsPruned > 0) {
        console.log(`[cleanup-uploads] pruned ${auditLogsPruned} AuditLog rows older than ${AUDIT_LOG_RETENTION_DAYS}d`);
      }
    } catch (auditErr) {
      console.error('[cleanup-uploads] AuditLog prune failed:', auditErr);
    }

    return NextResponse.json({
      ok: true,
      deleted: uploads.deleted,
      failed: uploads.failed,
      skipped: uploads.skipped,
      previewsDeleted: previews.deleted,
      previewsFailed: previews.failed,
      previewsSkipped: previews.skipped,
      reapedJobs: reaper.reaped,
      reapedRefundedCredits: reaper.refundedCredits,
      reapedRefundFailed: reaper.refundFailed,
      aiRollupDays,
      aiLogsPurged,
      purgedUsers: accountPurge.users,
      purgeFilesDeleted: accountPurge.filesDeleted,
      purgeFailures: accountPurge.failures,
      jobPayloadsStripped,
      toolUsagePruned,
      auditLogsPruned,
      membershipsExpired,
    });
  } catch (err: any) {
    console.error('[cleanup-uploads] fatal error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
