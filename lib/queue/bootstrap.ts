const globalKey = Symbol.for('genmetaai.queue.workers');

function shouldStartWorkers(): boolean {
  if (process.env.NEXT_PHASE) return false;
  if (process.env.VERCEL) return false;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/.test(url) && process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}

/**
 * Start the BullMQ workers exactly once per Node process. Safe to call from
 * any server module — the global guard prevents duplicate workers across
 * hot-reloads and multiple import sites.
 *
 * Redis / workers are optional: generation API routes run inline, so a
 * missing REDIS_URL must never take down auth or page renders.
 */
export function ensureWorkersStarted() {
  if (!shouldStartWorkers()) return;

  const g = globalThis as unknown as Record<PropertyKey, unknown>;
  if (g[globalKey]) return;

  g[globalKey] = true;

  import('@/lib/queue/workers')
    .then(({ startWorkers }) => {
      g[globalKey] = startWorkers();
      console.log('[queue] Workers started successfully');
    })
    .catch((error) => {
      console.error('[queue] Failed to start workers:', error);
      g[globalKey] = false;
    });
}

