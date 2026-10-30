import Link from 'next/link';
import { Zap } from 'lucide-react';

export function Footer({
  siteName = 'MetaCSV',
  logoUrl,
  tagline,
}: {
  siteName?: string;
  logoUrl?: string | null;
  /** T4-53: the SiteSettings tagline was write-only — render it here. */
  tagline?: string | null;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={siteName} className="h-8 w-8 object-contain rounded-lg" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Zap className="h-4 w-4" />
              </div>
            )}
            <span className="font-display font-semibold tracking-tight text-foreground">
              {siteName}
            </span>
            {tagline && (
              <span className="hidden text-xs text-muted-foreground sm:inline">{tagline}</span>
            )}
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </nav>

          <p className="text-xs text-muted-foreground">
            © {currentYear} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}