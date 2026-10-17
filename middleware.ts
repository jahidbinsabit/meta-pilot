import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

// Canonical cookie names, newest first. Auth.js v5 (next-auth@5) uses the
// `authjs.session-token` pair; the `next-auth.*` pair is kept as a single
// fallback for sessions minted before the v5 migration.
const COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
];

/** Pull the session JWT out of the request cookies */
function getSessionCookie(req: NextRequest): { name: string; value: string } | null {
  for (const name of COOKIE_NAMES) {
    const value = req.cookies.get(name)?.value;
    if (value) return { name, value };
  }
  return null;
}

/**
 * Decode the session JWT with at most two salt attempts: the cookie's own
 * name, then its v4/v5 counterpart. The old code tried every salt for every
 * cookie (up to 16 decode attempts per request on the edge); the salt is
 * deterministic per cookie name, so one fallback is sufficient.
 */
function counterpartSalt(cookieName: string): string | null {
  const pairs: Record<string, string> = {
    '__Secure-authjs.session-token': '__Secure-next-auth.session-token',
    'authjs.session-token': 'next-auth.session-token',
    '__Secure-next-auth.session-token': '__Secure-authjs.session-token',
    'next-auth.session-token': 'authjs.session-token',
  };
  return pairs[cookieName] ?? null;
}

async function decodeSessionToken(tokenValue: string, cookieName: string) {
  if (!SECRET) return null;

  const salts = [cookieName, counterpartSalt(cookieName)].filter(Boolean) as string[];
  for (const salt of salts) {
    try {
      const token = await decode({
        token: tokenValue,
        secret: SECRET,
        salt,
      });
      if (token) return token;
    } catch {
      // Try the next salt
    }
  }

  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only gate dashboard + admin routes.
  const isDashboard = pathname.startsWith('/dashboard');
  const isAdmin = pathname.startsWith('/admin');
  if (!isDashboard && !isAdmin) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);
  let token: any = null;
  if (sessionCookie) {
    token = await decodeSessionToken(sessionCookie.value, sessionCookie.name);
  }

  // Not signed in → send to login.
  if (!token?.sub) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require role === 'admin'.
  if (isAdmin && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  // Match every dashboard + admin route so the edge runs for them.
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
