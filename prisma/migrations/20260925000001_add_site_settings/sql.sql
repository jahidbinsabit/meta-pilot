-- Create global site settings (PROMPT 9.8 / 9.10) — single-row config
-- for SEO meta tags and analytics injection on marketing pages.

CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'StockForge AI',
    "tagline" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "twitterHandle" TEXT,
    "gaMeasurementId" TEXT,
    "gscVerification" TEXT,
    "gscVerificationMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteSettings_updatedAt_idx" ON "SiteSettings" ("updatedAt");