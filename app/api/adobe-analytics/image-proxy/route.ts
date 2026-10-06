import { NextResponse } from 'next/server';

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
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl || !isAllowedHost(targetUrl)) {
    return new NextResponse('Invalid or forbidden image URL', { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      cache: 'force-cache',
    });

    if (!res.ok) {
      return new NextResponse(`Upstream returned ${res.status}`, { status: res.status });
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
  } catch (err: any) {
    return new NextResponse(err.message || 'Image proxy failed', { status: 502 });
  }
}
