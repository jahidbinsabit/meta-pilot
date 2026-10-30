import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import getServerSession from '@/lib/server-session';

export const runtime = 'nodejs';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // matches lib/auth-options session.maxAge

// Auth.js session cookie names (plus chunked `.0`, `.1`, … suffixes for
// large JWTs). The login form's "Remember this browser" choice is applied
// by re-issuing these cookies: with a 30-day Max-Age when remembered, or
// as browser-session cookies (no Max-Age/Expires) when not — the token
// value itself is untouched, only its persistence changes (T1-07: the
// checkbox used to be dead state that nothing read).
const SESSION_COOKIE_PREFIXES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
];

function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`),
  );
}

/** POST /api/account/session-mode { remember: boolean } */
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let remember = true;
  try {
    const body = await req.json();
    remember = body?.remember !== false;
  } catch {
    // default: remembered
  }

  const store = await cookies();
  const sessionCookies = store.getAll().filter((c) => isSessionCookie(c.name));
  if (sessionCookies.length === 0) {
    return NextResponse.json({ error: 'no_session_cookie' }, { status: 400 });
  }

  for (const cookie of sessionCookies) {
    store.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: cookie.name.startsWith('__Secure-'),
      ...(remember ? { maxAge: SESSION_MAX_AGE } : {}),
    });
  }

  return NextResponse.json({ ok: true, remember });
}
