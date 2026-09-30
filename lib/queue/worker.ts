/**
 * Standalone worker entry point.
 *
 * Run with: `node lib/queue/worker.js` (after `next build` with
 * `NEXT_STANDALONE=1`) or `npx tsx lib/queue/worker.ts`.
 *
 * The workers are also started lazily inside the Next.js server via
 * `ensureWorkersStarted()` so that queue jobs are consumed even without a
 * dedicated worker process.
 */
import { startWorkers, stopWorkers } from '@/lib/queue/workers';
import { closeQueue } from '@/lib/queue/client';

async function main() {
  const workers = startWorkers();
  console.log(`[queue] started ${workers.length} workers`);

  const shutdown = async (signal: string) => {
    console.log(`[queue] ${signal} received, shutting down...`);
    await stopWorkers();
    await closeQueue();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[queue] fatal error', err);
  process.exit(1);
});
