import NextAuth from 'next-auth';
import { decode } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth-options';

/**
 * next-auth v5 has no `getServerSession` export. The v5 way to read a
 * session from a server component / route handler is the `auth()` function
 * returned by `NextAuth(config)`. We build it once here and re-export it so
 * every server-side call site stays provider-agnostic.
 */
export const { auth, handlers, signIn, signOut } = NextAuth(authOptions);

/**
 * Refresh the session JWT so a freshly-updated `role` / `membershipPlan`
 * (e.g. after an admin role change or a plan upgrade) is picked up by the
 * next request without the user logging out and back in.
 *
 * Reads the current JWT, re-fetches the user from the DB, and re-encodes
 * the token with the latest role/membership/credits.
 */
export async function refreshSessionJWT(req?: Request) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  // `auth()` returns the decoded session; we instead decode the raw cookie
  // so we can re-encode it with fresh claims.
  const cookieName =
    (req as any)?.headers?.get('cookie') ??
    (typeof Request !== 'undefined' && req instanceof Request ? req.headers.get('cookie') : '');
  if (!cookieName) return false;
  const cookies = Object.fromEntries(
    cookieName.split(';').map((c: string) => {
      const [k, ...v] = c.split('=');
      return [k.trim(), decodeURIComponent(v.join('=').trim())];
    }),
  );
  const tokenValue = cookies['__Secure-authjs.session-token'] ?? cookies['authjs.session-token'];
  if (!tokenValue) return false;
  const decoded = await decode({
    token: tokenValue,
    secret,
    // Auth.js derives the encryption key from the session cookie name; this
    // must match or the JWT won't decrypt.
    salt: 'authjs.session-token',
  });
  if (!decoded?.sub) return false;
  const user = await (
    await import('@/lib/db')
  ).prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: { plan: true },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!user) return false;
  const activeMembership = user.memberships[0]?.plan?.tier || user.membership || 'FREE';
  const { encode } = await import('next-auth/jwt');
  const newToken = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
      image: user.image ?? undefined,
      role: user.role,
      membershipPlan: activeMembership,
      credits: user.credits,
    },
    secret,
    salt: 'authjs.session-token',
    maxAge: 30 * 24 * 60 * 60, // 30 days (increased from 30 minutes)
  });
  return newToken;
}
