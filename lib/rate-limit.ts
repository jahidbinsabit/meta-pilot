import { NextResponse } from 'next/server';

/**
 * Simple in-memory rate limiter for API routes.
 *
 * Tracks request timestamps per key (typically client IP) in a Map and
 * rejects when more than `max` requests arrive within `windowMs`.
 *
 * Note: in-memory state is per-process. On multi-instance deployments each
 * instance enforces its own limit. For this app's single-container VPS
 * deployment that is sufficient. A Redis-backed limiter would be needed
 * for horizontal scaling.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of stale buckets to bound memory growth.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number, windowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    const fresh = bucket.timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) {
      buckets.delete(key);
    } else {
      bucket.timestamps = fresh;
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the client may retry (0 when allowed). */
  retryAfter: number;
  remaining: number;
}

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  cleanup(now, opts.windowMs);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Drop timestamps outside the window.
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < opts.windowMs);

  if (bucket.timestamps.length >= opts.max) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.ceil((oldest + opts.windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: 0 };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfter: 0, remaining: opts.max - bucket.timestamps.length };
}

/**
 * Extract the client IP from a Request, honoring common proxy headers.
 * The VPS sits behind a reverse proxy, so X-Forwarded-For is expected.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Convenience wrapper: returns a 429 JSON Response when the limit is hit,
 * or null when the request may proceed.
 */
export function rateLimitResponse(
  req: Request,
  opts: { max: number; windowMs: number; scope: string },
): Response | null {
  const ip = getClientIp(req);
  const result = rateLimit(`${opts.scope}:${ip}`, opts);
  if (!result.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: result.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfter) },
      },
    );
  }
  return null;
}
