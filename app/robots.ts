import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    'https://metapilot.reflecters.com';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin/', '/api/', '/dashboard/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
