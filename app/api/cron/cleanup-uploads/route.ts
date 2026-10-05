import { NextResponse } from 'next/server';
import { listFiles, deleteFile } from '@/lib/s3/client';

/**
 * Cleanup cron — deletes temporary uploads older than 5 minutes.
 *
 * S3 key pattern:  uploads/<userId>/<timestamp>-<filename>
 * Local pattern:   public/uploads/uploads-<userId>-<timestamp>-<filename>
 *
 * Vercel Cron calls this with  x-cron-secret  header every 5 minutes.
 * GET /api/cron/cleanup-uploads
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: Request) {
  // Auth — same pattern as /api/cron/daily-credits
  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = Date.now() - TTL_MS;
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // List everything under uploads/
    const files = await listFiles('uploads/');

    for (const file of files) {
      // Key format: uploads/<userId>/<timestamp>-<name>
      // Extract timestamp from the filename segment
      const segments = file.key.split('/');
      const fileSegment = segments[2] ?? '';           // "<timestamp>-<name>"
      const tsStr = fileSegment.split('-')[0];         // "<timestamp>"
      const ts = Number(tsStr);

      if (!ts || isNaN(ts)) {
        skipped++;
        continue;
      }

      if (ts > cutoff) {
        // File is newer than TTL — skip
        skipped++;
        continue;
      }

      // File is older than 5 minutes — delete it
      try {
        await deleteFile(file.key);
        deleted++;
      } catch (err) {
        console.error(`[cleanup] Failed to delete ${file.key}:`, err);
        failed++;
      }
    }

    console.log(`[cleanup-uploads] done — deleted:${deleted} failed:${failed} skipped:${skipped}`);

    return NextResponse.json({ ok: true, deleted, failed, skipped });
  } catch (err: any) {
    console.error('[cleanup-uploads] fatal error:', err);
    return NextResponse.json({ error: err.message ?? 'cleanup_failed' }, { status: 500 });
  }
}
