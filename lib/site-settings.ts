import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { ensureDatabaseSchema } from '@/lib/db-sync';

export interface CachedSiteSettings {
  id: string;
  siteName: string;
  tagline: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  twitterHandle: string | null;
  gaMeasurementId: string | null;
  gscVerification: string | null;
  userApiKeyRequired: boolean;
  apifyApiToken: string | null;
  apifyActorId: string | null;
}

export const getSiteSettings = unstable_cache(
  async (): Promise<CachedSiteSettings | null> => {
    try {
      await ensureDatabaseSchema().catch(() => {});

      const settings = await prisma.siteSettings.findUnique({
        where: { id: 'default' },
        select: {
          id: true,
          siteName: true,
          tagline: true,
          metaTitle: true,
          metaDescription: true,
          ogImageUrl: true,
          twitterHandle: true,
          gaMeasurementId: true,
          gscVerification: true,
          userApiKeyRequired: true,
          apifyApiToken: true,
          apifyActorId: true,
        },
      }).catch(async () => {
        // Fallback if specific columns fail
        return await prisma.siteSettings.findUnique({
          where: { id: 'default' },
        }).catch(() => null);
      });

      return (settings as any) || null;
    } catch {
      return null;
    }
  },
  ['site-settings-default'],
  { revalidate: 60, tags: ['site-settings'] },
);

