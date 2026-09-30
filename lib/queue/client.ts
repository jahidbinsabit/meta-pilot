import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Redis is optional on Vercel. Serverless functions cannot run long-lived
 * BullMQ workers, and a leftover `redis://localhost:6379` env var would
 * spam ECONNREFUSED during both `next build` and runtime.
 */
export function getRedisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return undefined;
  const isLoopback = /localhost|127\.0\.0\.1/.test(url);
  if (isLoopback && (process.env.VERCEL || process.env.NEXT_PHASE)) {
    return undefined;
  }
  return url;
}

export function isRedisEnabled(): boolean {
  return !!getRedisUrl();
}

let _connection: IORedis | null | undefined;

export function getConnection(): IORedis | null {
  if (_connection !== undefined) return _connection;
  const url = getRedisUrl();
  if (!url) {
    _connection = null;
    return null;
  }
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
  });
  _connection.on('error', (err) => {
    console.error('[redis]', err.message);
  });
  return _connection;
}

/** @deprecated Use getConnection() — kept so existing imports don't crash. */
export const connection = new Proxy({} as IORedis, {
  get(_target, prop) {
    const conn = getConnection();
    if (!conn) return undefined;
    const value = (conn as any)[prop];
    return typeof value === 'function' ? value.bind(conn) : value;
  },
});

function maybeQueue(name: string): Queue | null {
  const conn = getConnection();
  if (!conn) return null;
  return new Queue(name, { connection: conn });
}

export const metadataQueue = maybeQueue('metadata');
export const imagePromptQueue = maybeQueue('image-prompt');
export const analyticsQueue = maybeQueue('analytics');

export function getWorker(name: string, handler: (job: any) => Promise<void>) {
  const conn = getConnection();
  if (!conn) {
    throw new Error('Redis is not configured; cannot start worker ' + name);
  }
  return new Worker(name, handler, { connection: conn });
}

export async function closeQueue() {
  await Promise.all(
    [metadataQueue, imagePromptQueue, analyticsQueue]
      .filter(Boolean)
      .map((q) => q!.close()),
  );
  const conn = getConnection();
  if (conn) await conn.quit();
}

