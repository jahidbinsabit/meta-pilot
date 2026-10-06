import * as React from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';

export function LoginHeader() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/" className="group flex items-center gap-3 hover:opacity-90">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-accent via-indigo-600 to-blue-500 text-white shadow-lg shadow-accent/25 group-hover:scale-105 transition-transform">
          <Zap className="h-5 w-5 fill-white text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            StockForge <span className="text-accent">AI</span>
          </span>
          <span className="text-2xs font-medium text-muted-foreground uppercase tracking-widest">
            Metadata Studio
          </span>
        </div>
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
