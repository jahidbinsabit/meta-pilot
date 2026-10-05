import { NextResponse } from 'next/server';
import { listFiles, deleteFile } from '@/lib/s3/client';

/**
 * Cleanup cron — deletes temporary uploads older than 5 minutes.
 *
 * S3 key pattern:  uploads/<userId>/<timestamp>-<filename>
 *
 * Vercel Cron calls this every 5 minutes. When CRON_SECRET env var is set,
 * Vercel automatically sends: Authorization: Bearer <CRON_SECRET>
 * GET /api/cron/cleanup-uploads
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: Request) {
  // Auth: Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically
  // Also accept x-cron-secret for manual/external triggers
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret) {
    const validBearer = authHeader === `Bearer ${expectedSecret}`;
    const validHeader = cronSecret === expectedSecret;
    if (!validBearer && !validHeader) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
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
      const fileSegment = segments[2] ?? '';       // "<timestamp>-<name>"
      const tsStr = fileSegment.split('-')[0];     // "<timestamp>"
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
    return NextResponse.json({ ok: true, deleted, failed, skipped });
  } catch (err: any) {
    console.error('[cleanup-uploads] fatal error:', err);
    return NextResponse.json({ error: err.message ?? 'cleanup_failed' }, { status: 500 });
  }
}
