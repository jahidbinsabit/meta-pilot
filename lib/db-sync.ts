import { prisma } from '@/lib/db';

let isSynced = false;

/**
 * Ensures newly added schema columns exist in PostgreSQL database.
 * This runs safe idempotent DDL statements so queries never crash
 * if a production database hasn't had `prisma db push` run manually.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (isSynced) return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  try {
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        -- SiteSettings columns
        BEGIN
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "apifyApiToken" TEXT;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "apifyActorId" TEXT;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- User columns
        BEGIN
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "grokApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "openaiApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredAiProvider" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END $$;
    `);
    isSynced = true;
  } catch (err) {
    // Non-fatal fallback
    console.warn('[db-sync] Schema check notice (safe to ignore):', err);
  }
}
