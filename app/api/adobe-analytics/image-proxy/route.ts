import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = [
  'ftcdn.net',
  'as1.ftcdn.net',
  'as2.ftcdn.net',
  't3.ftcdn.net',
  't4.ftcdn.net',
  'stock.adobe.com',
  'openverse.org',
  'wikimedia.org',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
];

function isAllowedHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return ALLOWED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  // Authenticated users only — this proxies third-party image bytes.
  try {
    await requireApiUser(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl || !isAllowedHost(targetUrl)) {
    return NextResponse.json({ error: 'invalid_image_url' }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      cache: 'force-cache',
      // Never follow redirects server-side: an allowlisted host could
      // redirect to an internal/metadata URL (SSRF).
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    // Reject redirects outright rather than following them.
    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json({ error: 'redirect_not_allowed' }, { status: 400 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }

    // 10MB cap — refuse to buffer huge responses into memory.
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'image_proxy_failed' }, { status: 502 });
  }
}
