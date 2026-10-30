import { getSiteSettings } from '@/lib/site-settings';
import getServerSession from '@/lib/server-session';
import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [siteSettings, session] = await Promise.all([
    getSiteSettings(),
    getServerSession().catch(() => null),
  ]);
  const siteName = siteSettings?.siteName || 'MetaCSV';
  const logoUrl = siteSettings?.logoUrl;
  const tagline = siteSettings?.tagline;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar siteName={siteName} logoUrl={logoUrl} initialAuthed={!!session?.user} />
      <main className="flex-1">{children}</main>
      <Footer siteName={siteName} logoUrl={logoUrl} tagline={tagline} />
    </div>
  );
}