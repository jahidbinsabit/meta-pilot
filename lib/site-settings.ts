import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';

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
}

export const getSiteSettings = unstable_cache(
  async (): Promise<CachedSiteSettings | null> => {
    try {
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
        },
      });
      return settings;
    } catch {
      return null;
    }
  },
  ['site-settings-default'],
  { revalidate: 60, tags: ['site-settings'] },
);
