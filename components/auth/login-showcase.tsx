import * as React from 'react';
import { Sparkles, TrendingUp, Layers, Star, FileSpreadsheet } from 'lucide-react';

export function LoginShowcase() {
  return (
    <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between border-l border-border/60 bg-gradient-to-br from-card/90 via-background to-card/60 p-10 xl:p-12 relative overflow-hidden">
      <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-accent/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-80 w-80 rounded-full bg-blue-600/15 blur-[120px]" />

      <div className="relative z-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Next-Gen Microstock AI Platform</span>
        </div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground xl:text-4xl leading-tight max-w-xl">
          Automate metadata tagging, analyze markets, and scale sales.
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
          Generate commercial titles, descriptions, and rank #1 with SEO keywords for Adobe Stock, Shutterstock, and Freepik.
        </p>
      </div>

      <div className="relative z-10 my-6 space-y-3.5">
        <div className="rounded-2xl border border-white/10 bg-card/80 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent font-bold text-xs">
                AI
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span>Batch Metadata Generator</span>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-400">
                    Ready
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">Processed in 1.4s</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-2xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              <FileSpreadsheet className="h-3 w-3" />
              <span>Adobe CSV</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="rounded-lg bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground/90 border border-border/50">
              Cinematic aerial view of futuristic cyberpunk metropolis with glowing neon skyscraper reflections
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['cyberpunk', 'futuristic city', 'neon skyline', 'drone shot', 'night architecture'].map((tag) => (
                <span key={tag} className="rounded-md border border-border/80 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-accent text-xs font-semibold">
              <Layers className="h-3.5 w-3.5" />
              <span>500+ Files</span>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">Simultaneous batch sync</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Analytics</span>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">Real-time download stats</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>6+ Platforms</span>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">Ready CSV exports</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 pt-2 border-t border-border/50">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Compatible With Major Platforms
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          {['Adobe Stock', 'Shutterstock', 'Freepik', 'Vecteezy', 'Getty / iStock'].map((a) => (
            <span key={a} className="rounded-lg bg-card/60 px-2.5 py-1 border border-border/50">
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
