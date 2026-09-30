import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!;

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

async function decodeSessionToken(tokenValue: string, cookieName: string) {
  if (!SECRET) return null;

  // 1. Try decoding with the exact cookie name (standard in Auth.js / NextAuth v5)
  try {
    const token = await decode({
      token: tokenValue,
      secret: SECRET,
      salt: cookieName,
    });
    if (token) return token;
  } catch {
    // Try fallback salts
  }

  // 2. Try alternative known salts if exact cookie name failed
  const fallbackSalts = COOKIE_NAMES.filter((s) => s !== cookieName);
  for (const salt of fallbackSalts) {
    try {
      const token = await decode({
        token: tokenValue,
        secret: SECRET,
        salt,
      });
      if (token) return token;
    } catch {
      // Continue trying
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

