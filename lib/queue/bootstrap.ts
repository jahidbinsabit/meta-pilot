import { startWorkers } from '@/lib/queue/workers';

const globalKey = Symbol.for('genmetaai.queue.workers');

/**
 * Start the BullMQ workers exactly once per Node process. Safe to call from
 * any server module — the global guard prevents duplicate workers across
 * hot-reloads and multiple import sites.
 */
export function ensureWorkersStarted() {
  const g = globalThis as unknown as Record<PropertyKey, unknown>;
  if (g[globalKey]) return;
  
  try {
    g[globalKey] = startWorkers();
    console.log('[queue] Workers started successfully');
  } catch (error) {
    console.error('[queue] Failed to start workers:', error);
    // Don't throw - allow the app to start even if queue workers fail
    // This prevents complete app failure if Redis is temporarily unavailable
  }
}
