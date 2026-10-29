import * as React from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';

/**
 * Auth-page brand header. Uses the SAME brand block as the public site
 * header (components/marketing/navbar.tsx): the site-settings logo in an
 * accent tile (Zap mark as fallback) next to the site name — no separate
 * auth-only logo, so the brand is identical on every surface.
 */
export function LoginHeader({
  siteName,
  logoUrl,
}: {
  siteName?: string;
  logoUrl?: string | null;
}) {
  const name = siteName || 'MetaCSV';
  return (
    <div className="flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="absolute inset-0 h-full w-full rounded-lg object-contain" />
          ) : (
            <Zap className="h-5 w-5" />
          )}
        </div>
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          {name}
        </span>
      </Link>
      <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-2xs font-medium text-emerald-400">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>AI v2.5 Online</span>
      </div>
    </div>
  );
}
