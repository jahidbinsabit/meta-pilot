import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import type { Prisma, User } from '@prisma/client';

export async function getCurrentUser() {
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export function checkRole(user: User | null, role: 'USER' | 'ADMIN') {
  if (!user) return false;
  return user.role === role;
}

export function isAdmin(user: User | null) {
  return !!user && user.role === 'ADMIN';
}
