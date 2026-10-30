'use client';

import * as React from 'react';
import Link from 'next/link';

export default function RootGlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('Root global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground font-sans p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive text-2xl font-bold">
            !
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Application Error</h1>
          <p className="text-sm text-muted-foreground">
            A critical error occurred while processing your request. Please try refreshing the page.
          </p>
          {error?.digest && (
            <p className="font-mono text-xs text-muted-foreground/60">
              Digest: {error.digest}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-accent/10 transition-colors"
            >
              Return Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
