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

        -- CouponRedemption table (one row per user per coupon; unique
        -- constraint makes double-redeem impossible under concurrency)
        BEGIN
          CREATE TABLE IF NOT EXISTS "CouponRedemption" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "couponId" TEXT NOT NULL REFERENCES "Coupon"("id") ON DELETE CASCADE,
            "userId" TEXT NOT NULL,
            "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "CouponRedemption_couponId_userId_key" UNIQUE ("couponId", "userId")
          );
          CREATE INDEX IF NOT EXISTS "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- Payment transactionRef uniqueness (H4 backstop). Deliberately
        -- NOT a @unique in schema.prisma: deploy runs prisma db push
        -- before app boot, and db push would fail on a database that
        -- still contains duplicate refs — the dedupe below must run
        -- first, so the unique index is created here, after dedupe.
        BEGIN
          -- Free refs held by REJECTED payments, mirroring rejectPayment
          -- (which suffixes the ref at rejection time): a rejected
          -- payment must not block a corrected re-submission with the
          -- original TrxID once the unique index exists.
          UPDATE "Payment"
          SET "transactionRef" = "transactionRef" || ':rejected:' || "id"
          WHERE "transactionRef" IS NOT NULL
            AND "status" = 'REJECTED'
            AND "transactionRef" NOT LIKE ('%:rejected:' || "id");

          -- Rename later duplicates of any still-shared ref: the
          -- earliest-created row keeps the bare ref, later rows are
          -- suffixed with their own id so the index can be created.
          UPDATE "Payment" p
          SET "transactionRef" = p."transactionRef" || ':dup:' || p."id"
          FROM (
            SELECT "id",
                   ROW_NUMBER() OVER (
                     PARTITION BY "transactionRef"
                     ORDER BY "createdAt" ASC, "id" ASC
                   ) AS rn
            FROM "Payment"
            WHERE "transactionRef" IS NOT NULL
          ) ranked
          WHERE p."id" = ranked."id" AND ranked.rn > 1;

          CREATE UNIQUE INDEX IF NOT EXISTS "Payment_transactionRef_key" ON "Payment"("transactionRef");
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
