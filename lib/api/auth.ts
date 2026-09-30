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
  return user;
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
