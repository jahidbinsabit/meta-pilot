import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ownsStorageKey } from '@/lib/api/ownership';

/**
 * SSRF-safe image fetching + image-reference validation (audit R7, H1/H2).
 *
 * Two surfaces:
 *
 * 1. `fetchImageGuarded` — for EXTERNAL http(s) image URLs the server is
 *    asked to fetch on a user's behalf (the Chrome-extension image-prompt
 *    flow). Defenses: http/https only; the hostname is resolved via DNS
 *    and EVERY resolved address must be public (private / loopback /
 *    link-local / reserved ranges are rejected, including IPv4-mapped
 *    IPv6); redirects are followed manually (≤3) with each hop
 *    re-validated; the response must be image/*; the body is stream-capped
 *    at MAX_IMAGE_BYTES; 10s timeout per hop.
 *    Known residual: DNS is re-resolved by fetch itself, so a hostile
 *    authoritative server could in theory rebind between the check and
 *    the connect (TOCTOU). Fully closing that needs a pinned-IP dialer,
 *    which undici does not expose here; the check still defeats the
 *    realistic attacks (literal internal IPs, internal hostnames,
 *    metadata endpoints, redirect-to-internal).
 *
 * 2. `normalizeOwnedImageRef` — entry validation for generation requests.
 *    A client-submitted image reference is accepted only if it is
 *    (a) a storage reference the caller OWNS (raw key, /api/s3/<key> URL,
 *        or the local-mode flat /uploads/<name> URL — all normalized to
 *        the canonical raw key), or
 *    (b) a `data:` image URL whose decoded size is within the cap.
 *    Anything else (external URLs, other users' keys, other paths) is
 *    rejected, so an attacker can never make the AI adapters read another
 *    user's private image or an internal URL via a generation request.
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* IP range checks                                                     */
/* ------------------------------------------------------------------ */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function inCidr(n: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((base & mask) >>> 0);
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this host" / unspecified source block
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT shared address space
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1 (documentation)
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2 (documentation)
  ['203.0.113.0', 24], // TEST-NET-3 (documentation)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (incl. 255.255.255.255)
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  return BLOCKED_V4.some(([base, bits]) => {
    const b = ipv4ToInt(base);
    return b !== null && inCidr(n, b, bits);
  });
}

function isBlockedIpv6(raw: string): boolean {
  let ip = raw.toLowerCase().split('%')[0]; // strip zone id
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);

  if (ip === '::1' || ip === '::') return true; // loopback / unspecified

  // IPv4-mapped / IPv4-compatible forms — judge the embedded IPv4.
  const mapped = /^::ffff:(.+)$/.exec(ip);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes('.')) return isBlockedIpv4(tail);
    const hex = tail.split(':');
    if (hex.length === 2) {
      const hi = parseInt(hex[0], 16);
      const lo = parseInt(hex[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        return isBlockedIpv4(
          `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
        );
      }
    }
    return true;
  }
  const compat = /^::(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (compat) return isBlockedIpv4(compat[1]);

  const firstHextet = ip.split(':')[0];
  const first = parseInt(firstHextet || '0', 16);
  if (Number.isFinite(first)) {
    if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 link-local
    if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7 unique-local
    if (first >= 0xff00) return true; // ff00::/8 multicast
  }
  if (ip.startsWith('2001:db8:') || ip.startsWith('2001:0db8:')) return true; // documentation
  if (ip.startsWith('64:ff9b:')) return true; // NAT64 well-known prefix (embeds arbitrary IPv4)
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not an IP literal at all → unsafe to treat as one
}

async function assertHostResolvesPublic(hostname: string): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    // getaddrinfo handles IP literals too (including hex/decimal IPv4
    // spellings), so literal and named hosts take the same path.
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('image_host_unresolvable');
  }
  if (addresses.length === 0) throw new Error('image_host_unresolvable');
  for (const { address } of addresses) {
    if (isBlockedIp(address)) throw new Error('unsafe_image_url');
  }
}

/* ------------------------------------------------------------------ */
/* Guarded external fetch                                              */
/* ------------------------------------------------------------------ */

export interface GuardedImage {
  buffer: Buffer;
  contentType: string;
}

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

/** Default byte cap for `fetchBufferSafe` (generic guarded downloads). */
export const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Shared guarded-fetch core: same SSRF defenses as `fetchImageGuarded`
 * (public-IP validation per hop, manual redirects, streamed byte cap).
 * `requireImage` additionally enforces an `image/*` response type.
 */
async function fetchGuarded(
  rawUrl: string,
  opts: { maxBytes: number; requireImage: boolean },
): Promise<GuardedImage> {
  const maxBytes = opts.maxBytes;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      throw new Error('unsafe_image_url');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsafe_image_url');
    }
    await assertHostResolvesPublic(url.hostname);

    const res = await fetch(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => {
      throw new Error('image_fetch_failed');
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      // Drain the body so the connection can be reused/closed cleanly.
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
      if (!location || hop === MAX_REDIRECTS) {
        throw new Error('too_many_redirects');
      }
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new Error('unsafe_image_url');
      }
      continue;
    }

    if (!res.ok) throw new Error('image_fetch_failed');

    const contentType = (res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (opts.requireImage && !contentType.startsWith('image/')) {
      throw new Error('image_not_image');
    }

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('image_too_large');

    if (!res.body) throw new Error('image_fetch_failed');
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          throw new Error('image_too_large');
        }
        chunks.push(value);
      }
    }

    return { buffer: Buffer.concat(chunks), contentType };
  }

  throw new Error('too_many_redirects');
}

export async function fetchImageGuarded(
  rawUrl: string,
  opts?: { maxBytes?: number },
): Promise<GuardedImage> {
  return fetchGuarded(rawUrl, {
    maxBytes: opts?.maxBytes ?? MAX_IMAGE_BYTES,
    requireImage: true,
  });
}

/**
 * SSRF-safe generic download (audit R9, S9-02): identical guards to
 * `fetchImageGuarded` — http/https only, every resolved address must be
 * public, redirects followed manually (≤3) with per-hop re-validation,
 * declared Content-Length checked AND the body stream-capped (default
 * `MAX_BUFFER_BYTES`) — but no `image/*` requirement, so callers that
 * resolve arbitrary references server-side (e.g. the Gemini adapter's
 * inline-image resolver) never fall back to a bare `fetch`.
 * Returns the body bytes plus the response Content-Type (may be '').
 * Throws the same error codes as `fetchImageGuarded`.
 */
export async function fetchBufferSafe(
  rawUrl: string,
  opts?: { maxBytes?: number },
): Promise<GuardedImage> {
  return fetchGuarded(rawUrl, {
    maxBytes: opts?.maxBytes ?? MAX_BUFFER_BYTES,
    requireImage: false,
  });
}

/* ------------------------------------------------------------------ */
/* data: URL decoding (with the size cap the fetch branch always had)  */
/* ------------------------------------------------------------------ */

/**
 * Decode a `data:image/...;base64,...` URL. Returns null when the value
 * is not a data: URL at all; throws `image_not_image` for a data: URL
 * whose MIME is not an image and `image_too_large` when the decoded
 * payload exceeds `maxBytes` (estimated from the base64 length BEFORE
 * decoding, so an oversized payload is never fully buffered first).
 */
export function decodeDataImageUrl(
  value: string,
  maxBytes: number = MAX_IMAGE_BYTES,
): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(value);
  if (!match) return null;
  const mime = match[1].trim().toLowerCase();
  if (!mime.startsWith('image/')) throw new Error('image_not_image');

  const b64 = match[2].replace(/\s+/g, '');
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const estimated = Math.floor((b64.length * 3) / 4) - padding;
  if (estimated > maxBytes) throw new Error('image_too_large');

  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length > maxBytes) throw new Error('image_too_large');
  return { mime, buffer };
}

/* ------------------------------------------------------------------ */
/* Owned image-reference validation (generation entry points, H1)      */
/* ------------------------------------------------------------------ */

/** Normalize `.`/`..` segments the same way ownsStorageKey judges them. */
function canonicalizeKey(key: string): string | null {
  const out: string[] = [];
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null; // climbs above the root
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

export type ImageRefResult = { ok: true; value: string } | { ok: false };

/**
 * Validate a client-submitted image reference for a generation request
 * and normalize it to the canonical form the runners/adapters already
 * handle: a raw storage key (`uploads/<userId>/…` / `previews/<userId>/…`)
 * or the original `data:` URL. Accepted input shapes:
 *   - raw key:                uploads/<uid>/… | previews/<uid>/…
 *   - S3 proxy URL:           /api/s3/<url-encoded key> (relative or absolute)
 *   - local-mode public URL:  /uploads/<flattened key> (relative or absolute)
 *   - data: image URL within the decoded-size cap
 * The storage key must belong to `userId` (ownsStorageKey). Everything
 * else — external URLs, other users' keys, arbitrary paths — is rejected.
 */
export function normalizeOwnedImageRef(
  userId: string,
  value: unknown,
): ImageRefResult {
  if (typeof value !== 'string' || value.length === 0) return { ok: false };
  const v = value.trim();
  if (!v) return { ok: false };

  if (/^data:/i.test(v)) {
    try {
      decodeDataImageUrl(v);
      return { ok: true, value: v };
    } catch {
      return { ok: false };
    }
  }

  // Absolute URLs are judged by their path alone — the host is discarded
  // and only the extracted, ownership-checked key is ever used downstream.
  let path = v;
  if (/^https?:\/\//i.test(v)) {
    try {
      path = new URL(v).pathname;
    } catch {
      return { ok: false };
    }
  }

  // /api/s3/<key> — publicUrl() shape in S3 mode.
  const s3 = /\/api\/s3\/(.+)$/.exec(path);
  if (s3) {
    let key: string;
    try {
      key = decodeURIComponent(s3[1]);
    } catch {
      return { ok: false };
    }
    const canon = canonicalizeKey(key);
    return canon && ownsStorageKey(userId, canon)
      ? { ok: true, value: canon }
      : { ok: false };
  }

  // Raw key submitted directly.
  if (v.startsWith('uploads/') || v.startsWith('previews/')) {
    const canon = canonicalizeKey(v);
    return canon && ownsStorageKey(userId, canon)
      ? { ok: true, value: canon }
      : { ok: false };
  }

  // Local-mode flat public URL: /uploads/<key with '/' flattened to '-'>.
  // The first two dashes separate namespace and userId (neither contains
  // a dash), exactly mirroring lib/s3/local-fallback's reconstruction.
  const up = /\/uploads\/([^/?#]+)/.exec(path);
  if (up) {
    let flat: string;
    try {
      flat = decodeURIComponent(up[1]);
    } catch {
      return { ok: false };
    }
    const m = /^(uploads|previews)-([^-/]+)-(.+)$/.exec(flat);
    if (m) {
      const canon = canonicalizeKey(`${m[1]}/${m[2]}/${m[3]}`);
      if (canon && ownsStorageKey(userId, canon)) {
        return { ok: true, value: canon };
      }
    }
    return { ok: false };
  }

  return { ok: false };
}
