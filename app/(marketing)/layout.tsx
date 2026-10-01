import { prisma } from '@/lib/db';
import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteSettings = await prisma.siteSettings
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);
  const siteName = siteSettings?.siteName || 'StockForge AI';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar siteName={siteName} />
      <main className="flex-1">{children}</main>
      <Footer siteName={siteName} />
    </div>
  );
}