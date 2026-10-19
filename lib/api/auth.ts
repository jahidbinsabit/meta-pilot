import { auth } from '@/lib/auth-handler';
import { prisma } from '@/lib/db';
import type { Prisma, User } from '@prisma/client';

export async function requireApiUser(req?: Request): Promise<User> {
  // In Next.js App Router with NextAuth v5, auth() doesn't take parameters
  // It automatically reads from the request context
  const session = await auth();
  if (!session?.user?.email) throw new Error('UNAUTHORIZED');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('UNAUTHORIZED');
  assertUserActive(user);
  return user;
}

/**
 * Reject suspended or soft-deleted users. Call after resolving the user in
 * every auth entry point (session, API key, credentials login).
 */
export function assertUserActive(user: Pick<User, 'status' | 'deletedAt'>): void {
  if (user.deletedAt) throw new Error('FORBIDDEN');
  if (user.status === 'SUSPENDED') throw new Error('FORBIDDEN');
}

export async function requireApiAdmin(req?: Request): Promise<User> {
  const user = await requireApiUser(req);
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export function jsonError(res: Response, status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Validate an `Authorization: Bearer sk_...` API key.
 * Returns the owning user if the key is valid, active, and has the required scope.
 * Throws 'UNAUTHORIZED' otherwise.
 */
export async function requireApiKey(req: Request, scope?: string): Promise<User> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(sk_[A-Za-z0-9_-]+)\s*$/);
  if (!match) throw new Error('UNAUTHORIZED');
  const key = match[1];

  const record = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: true },
  });
  if (!record || record.revoked) throw new Error('UNAUTHORIZED');
  if (scope && !record.scopes.includes(scope)) throw new Error('FORBIDDEN');

  assertUserActive(record.user);
  return record.user;
}

/**
 * Accept EITHER a session (requireApiUser) OR a Bearer API key.
 * Returns the user on success; throws 'UNAUTHORIZED' if neither works.
 */
export async function requireApiUserOrKey(req: Request, scope?: string): Promise<User> {
  // Try API key first (stateless, for external integrations).
  const header = req.headers.get('authorization') || '';
  if (/^Bearer\s+sk_/.test(header)) {
    return requireApiKey(req, scope);
  }
  // Fall back to session auth.
  return requireApiUser(req);
}
