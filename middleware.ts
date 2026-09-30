import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!;

/** Pull the session JWT out of the request cookies (both cookie names are
 *  emitted by next-auth v5 depending on the session cookie config). */
function getSessionCookie(req: NextRequest): string | null {
  const secureCookie = req.cookies.get('__Secure-authjs.session-token')?.value;
  if (secureCookie) return secureCookie;
  return req.cookies.get('authjs.session-token')?.value ?? null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only gate dashboard + admin routes.
  const isDashboard = pathname.startsWith('/dashboard');
  const isAdmin = pathname.startsWith('/admin');
  if (!isDashboard && !isAdmin) {
    return NextResponse.next();
  }

  const tokenValue = getSessionCookie(req);
  let token: any = null;
  if (tokenValue) {
    try {
      token = await decode({
        token: tokenValue,
        secret: SECRET,
        // Must match the cookie name Auth.js used to derive the key.
        salt: 'authjs.session-token',
      });
    } catch (error) {
      // Log authentication failures for debugging
      console.error('[middleware] Token decode failed:', error);
      token = null;
    }
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
