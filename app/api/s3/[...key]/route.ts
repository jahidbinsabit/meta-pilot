import { requireApiUser } from '@/lib/api/auth';
import { downloadFile } from '@/lib/s3/client';

/**
 * Serves objects stored in S3 through the app, so the URLs returned by
 * `publicUrl()` actually resolve. Previews are referenced by the dashboard
 * (thumbnails) and re-fetched server-side before each AI vision call.
 *
 * This route is OUTSIDE the middleware matcher (which only covers
 * /dashboard and /admin), so it authenticates on its own. Without the
 * ownership check below this would be an open read proxy over every user's
 * uploads, so both checks are load-bearing, not defensive padding.
 *
 * GET /api/s3/<key>
 */

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  eps: 'image/eps',
  ai: 'application/illustrator',
};

function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

/**
 * Collapses `.` and `..` segments and rejects any path that tries to climb
 * above the root. Returns null when the key escapes its own namespace.
 */
function normalizeKey(key: string): string | null {
  const out: string[] = [];
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      // Climbing past the root is always an escape attempt.
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.length > 0 ? out.join('/') : null;
}

export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  try {
    const user = await requireApiUser(req);
    // `publicUrl` percent-encodes the whole key, so the path can arrive as a
    // single segment. Decode each piece and rejoin.
    const raw = (params?.key || []).map(decodeURIComponent).join('/');
    if (!raw) {
      return new Response('missing key', { status: 400 });
    }

    // Normalize BEFORE the ownership check. A key like
    // `previews/<me>/../../<other>/secret.png` splits cleanly on `/` and would
    // otherwise pass a naive `segments[1] === user.id` test while still
    // resolving outside the caller's namespace.
    const key = normalizeKey(raw);
    if (!key) {
      return new Response('forbidden', { status: 403 });
    }
    // Objects are namespaced per user: `uploads/<userId>/…`
    // segments[0] = 'uploads', segments[1] = userId, segments[2] = filename
    const segments = key.split('/');
    if (segments.length < 3 || segments[0] !== 'uploads' || segments[1] !== user.id) {
      return new Response('forbidden', { status: 403 });
    }

    const body = await downloadFile(key);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(key),
        'Content-Length': String(body.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      return new Response('unauthorized', { status: 401 });
    }
    console.error('s3 get failed', e);
    return new Response('not found', { status: 404 });
  }
}
