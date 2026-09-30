import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import { AuthSessionProvider } from '@/components/auth-session-provider';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', 'arial']
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    if (settings) {
      return {
        title: settings.metaTitle || 'StockForge AI — AI Metadata for Stock Content Creators',
        description:
          settings.metaDescription ||
          'Generate AI metadata (title, description, keywords) for Adobe Stock, Shutterstock, Vecteezy and more. Get Adobe Stock market analytics and a suite of creative micro-tools.',
        metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
        openGraph: {
          title: settings.metaTitle || 'StockForge AI',
          description:
            settings.metaDescription || 'AI metadata generator for stock-content creators.',
          type: 'website',
          images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
        },
        twitter: {
          card: 'summary_large_image',
          creator: settings.twitterHandle ?? undefined,
        },
      };
    }
  } catch (e) {
    // Database not available, use defaults
  }

  return {
    title: 'StockForge AI — AI Metadata for Stock Content Creators',
    description:
      'Generate AI metadata (title, description, keywords) for Adobe Stock, Shutterstock, Vecteezy and more. Get Adobe Stock market analytics and a suite of creative micro-tools.',
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    openGraph: {
      title: 'StockForge AI',
      description: 'AI metadata generator for stock-content creators.',
      type: 'website',
    },
  };
}

async function getSiteSettings() {
  try {
    return await prisma.siteSettings.findUnique({ where: { id: 'default' } });
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const gaId = settings?.gaMeasurementId;
  const gscVerify = settings?.gscVerification;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {gscVerify && <meta name="google-site-verification" content={gscVerify} />}
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-config" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}
      </head>
      <body className={`${inter.variable} font-sans bg-background text-foreground antialiased`}>
        <AuthSessionProvider>
          <QueryProvider>
            <ToastProvider>
              <div className="min-h-screen flex flex-col">{children}</div>
            </ToastProvider>
          </QueryProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
