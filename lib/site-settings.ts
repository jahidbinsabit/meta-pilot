import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { ensureDatabaseSchema } from '@/lib/db-sync';

export interface CachedSiteSettings {
  id: string;
  siteName: string;
  logoUrl: string | null;
  siteIconUrl: string | null;
  tagline: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  twitterHandle: string | null;
  gaMeasurementId: string | null;
  gscVerification: string | null;
  userApiKeyRequired: boolean;
  signupCredits: number;
  unlimitedMode: boolean;
  apifyApiToken: string | null;
  apifyActorId: string | null;
}

/**
 * Detects "column does not exist" errors so we can run the one-time schema
 * sync lazily — only when the database is actually missing a column, never
 * on the hot path of every cold start.
 */
function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column .* does not exist/i.test(msg) || /undefined_column/i.test(msg);
}

async function fetchSiteSettings(): Promise<CachedSiteSettings | null> {
  const settings = await prisma.siteSettings
    .findUnique({
      where: { id: 'default' },
      select: {
        id: true,
        siteName: true,
        logoUrl: true,
        siteIconUrl: true,
        tagline: true,
        metaTitle: true,
        metaDescription: true,
        ogImageUrl: true,
        twitterHandle: true,
        gaMeasurementId: true,
        gscVerification: true,
        userApiKeyRequired: true,
        signupCredits: true,
        unlimitedMode: true,
        apifyApiToken: true,
        apifyActorId: true,
      },
    })
    .catch(async (err) => {
      // If a newly-added column is missing in the DB, sync the schema once and retry.
      if (isMissingColumnError(err)) {
        await ensureDatabaseSchema().catch(() => {});
        return await prisma.siteSettings
          .findUnique({
            where: { id: 'default' },
          })
          .catch(() => null);
      }
      // Fallback if specific columns fail for any other reason
      return await prisma.siteSettings
        .findUnique({
          where: { id: 'default' },
        })
        .catch(() => null);
    });

  return (settings as any) || null;
}

export const getSiteSettings = unstable_cache(
  async (): Promise<CachedSiteSettings | null> => {
    try {
      return await fetchSiteSettings();
    } catch {
      return null;
    }
  },
  ['site-settings-default'],
  { revalidate: 60, tags: ['site-settings'] },
);
