import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { QueryProvider } from '@/components/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import { AuthSessionProvider } from '@/components/auth-session-provider';
import { getSiteSettings } from '@/lib/site-settings';

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', 'arial']
});

function safeMetadataBase(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    'https://metapilot.reflecters.com',
  ];
  for (const raw of candidates) {
    if (raw && typeof raw === 'string') {
      try {
        const formatted = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
        return new URL(formatted);
      } catch {}
    }
  }
  return new URL('https://metapilot.reflecters.com');
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings();
    if (settings) {
      return {
        title: settings.metaTitle || 'MetaCSV — AI Metadata for Stock Content Creators',
        description:
          settings.metaDescription ||
          'Generate AI metadata (title, description, keywords) for Adobe Stock, Shutterstock, Vecteezy and more. Get Adobe Stock market analytics and a suite of creative micro-tools.',
        metadataBase: safeMetadataBase(),
        openGraph: {
          title: settings.metaTitle || 'MetaCSV',
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
    title: 'MetaCSV — AI Metadata for Stock Content Creators',
    description:
      'Generate AI metadata (title, description, keywords) for Adobe Stock, Shutterstock, Vecteezy and more. Get Adobe Stock market analytics and a suite of creative micro-tools.',
    metadataBase: safeMetadataBase(),
    openGraph: {
      title: 'MetaCSV',
      description: 'AI metadata generator for stock-content creators.',
      type: 'website',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const gaId = settings?.gaMeasurementId;
  const gscVerify = settings?.gscVerification;
  const siteIconUrl = settings?.siteIconUrl;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {siteIconUrl && <link rel="icon" href={siteIconUrl} />}
        {gscVerify && <meta name="google-site-verification" content={gscVerify} />}
        {/* Theme: dark is the default everywhere (the :root variables in
            globals.css are the dark theme; `.light` opts in). Apply the
            saved choice before paint to avoid a flash — handle both
            stored values explicitly so a stale class can never survive
            into a page whose stored preference says dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('metapilot-theme');document.documentElement.classList.toggle('light',t==='light');}catch(e){}})();`,
          }}
        />
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
