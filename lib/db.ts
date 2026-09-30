import { PrismaClient } from '@prisma/client';
import { ensureWorkersStarted } from '@/lib/queue/bootstrap';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Start BullMQ workers once per process. They consume jobs enqueued by the
// API routes (metadata, image-to-prompt, adobe analytics) and keep the
// platform responsive even without a dedicated worker process.
ensureWorkersStarted();
