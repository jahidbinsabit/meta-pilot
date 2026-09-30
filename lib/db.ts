import { PrismaClient } from '@prisma/client';
import { ensureWorkersStarted } from '@/lib/queue/bootstrap';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Start BullMQ workers only when Redis is actually available (local / Docker).
// On Vercel this is a no-op so importing prisma never opens localhost:6379.
ensureWorkersStarted();

