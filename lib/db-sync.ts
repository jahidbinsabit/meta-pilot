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
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "siteIconUrl" TEXT;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "apifyApiToken" TEXT;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "apifyActorId" TEXT;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "signupCredits" INTEGER NOT NULL DEFAULT 20;
          ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "unlimitedMode" BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- User columns
        BEGIN
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "grokApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "openaiApiKey" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredAiProvider" TEXT;
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
          ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedPurgeAt" TIMESTAMP(3);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- AiCallLog columns
        BEGIN
          ALTER TABLE "AiCallLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
          CREATE INDEX IF NOT EXISTS "AiCallLog_userId_idx" ON "AiCallLog"("userId");
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- Coupon table (promo codes)
        BEGIN
          CREATE TABLE IF NOT EXISTS "Coupon" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "code" TEXT NOT NULL UNIQUE,
            "creditsAmount" INTEGER NOT NULL,
            "maxUses" INTEGER NOT NULL DEFAULT 1,
            "usedCount" INTEGER NOT NULL DEFAULT 0,
            "expiresAt" TIMESTAMP(3),
            "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
            "createdById" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS "Coupon_code_idx" ON "Coupon"("code");
          CREATE INDEX IF NOT EXISTS "Coupon_isActive_idx" ON "Coupon"("isActive");
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
