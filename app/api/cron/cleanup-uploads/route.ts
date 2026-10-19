import { NextResponse } from 'next/server';
import { listFiles, deleteFile } from '@/lib/s3/client';
import { prisma } from '@/lib/db';

/**
 * Cleanup cron — deletes temporary uploads older than 5 minutes.
 *
 * S3 key pattern:  uploads/<userId>/<timestamp>-<filename>
 *
 * Called every 30 minutes from the VPS host crontab (see deploy-vps.sh).
 * Uploads are temporary by design — files live at most ~35 minutes.
 * GET /api/cron/cleanup-uploads
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const AI_LOG_RETENTION_DAYS = 90;

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
  const validBearer = authHeader === `Bearer ${expectedSecret}`;
  const validHeader = cronSecret === expectedSecret;
  if (!validBearer && !validHeader) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = Date.now() - TTL_MS;
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const files = await listFiles('uploads/');

    for (const file of files) {
      // Key format: uploads/<userId>/<timestamp>-<name>
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

    console.log(`[cleanup-uploads] done — deleted:${deleted} failed:${failed} skipped:${skipped}`);

    // Retention: purge AiCallLog rows older than 90 days (write-only table,
    // one row per AI call — would grow unboundedly otherwise).
    let aiLogsPurged = 0;
    try {
      const cutoff = new Date(Date.now() - AI_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const res = await prisma.aiCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      aiLogsPurged = res.count;
      if (aiLogsPurged > 0) {
        console.log(`[cleanup-uploads] purged ${aiLogsPurged} AiCallLog rows older than ${AI_LOG_RETENTION_DAYS}d`);
      }
    } catch (logErr) {
      console.error('[cleanup-uploads] AiCallLog purge failed:', logErr);
    }

    return NextResponse.json({ ok: true, deleted, failed, skipped, aiLogsPurged });
  } catch (err: any) {
    console.error('[cleanup-uploads] fatal error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
