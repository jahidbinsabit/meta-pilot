'use client';

import { CheckCircle2, Cpu, Sparkles, Wand2 } from 'lucide-react';

const keywords = [
  'minimalist workspace', 'remote work', 'laptop desk', 'creative agency',
  'modern office', 'freelance setup', 'clean desk', 'wooden table', '+42 more',
];

export function Hero3DVisual() {
  return (
    <div className="hero-visual-scene relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="hero-visual-glow absolute -inset-4 rounded-[2.5rem] bg-gradient-to-r from-accent/35 via-indigo-500/25 to-purple-500/35 blur-3xl" />
      <div className="hero-visual-card relative rounded-3xl border border-white/10 bg-card/80 p-5 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10 sm:p-6">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-1 font-mono text-2xs text-muted-foreground">ai-engine.worker</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-2xs font-semibold text-accent">
            <span className="hero-visual-status h-1.5 w-1.5 rounded-full bg-accent" /> Live generation
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
          <div className="group relative aspect-square overflow-hidden rounded-2xl border border-border/80 bg-muted/60 p-3 shadow-inner sm:col-span-5">
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-90 transition-transform duration-500 group-hover:scale-105">
              <div className="hero-visual-orb flex h-24 w-24 rotate-6 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/55 via-indigo-500/45 to-pink-500/50 p-0.5 shadow-xl transition-transform duration-500 group-hover:rotate-0">
                <div className="flex h-full w-full flex-col items-center justify-center rounded-[14px] bg-card p-2 text-center">
                  <Sparkles className="hero-visual-sparkle h-8 w-8 text-accent" />
                  <span className="mt-1 text-2xs font-bold text-foreground">4K asset</span>
                </div>
              </div>
            </div>
            <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-2xs font-medium text-white/90 backdrop-blur-md">
              <span className="truncate">workspace_mockup.jpg</span>
              <span className="font-bold text-emerald-400">Ready</span>
            </div>
          </div>

          <div className="space-y-3 sm:col-span-7">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-accent">Generated title</span>
                <span className="flex items-center gap-1 font-mono text-2xs text-muted-foreground"><Cpu className="h-3 w-3" /> AI</span>
              </div>
              <p className="mt-1 rounded-xl border border-border/60 bg-muted/50 p-2.5 text-xs font-medium leading-relaxed text-foreground">
                &ldquo;Modern minimalist workspace desk setup for remote work and creative design&rdquo;
              </p>
            </div>
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">SEO keywords (50)</span>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-hidden">
                {keywords.map((keyword, index) => (
                  <span key={keyword} className={`rounded-md border px-2 py-0.5 text-2xs font-medium ${index === keywords.length - 1 ? 'border-accent/40 bg-accent/20 font-semibold text-accent' : 'border-border/80 bg-card text-muted-foreground'}`}>
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-2xs text-muted-foreground">
          <div className="flex gap-2 sm:gap-3">
            {['Adobe Stock', 'Shutterstock', 'Freepik'].map((platform) => <span key={platform} className="flex items-center gap-1 font-medium text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />{platform}</span>)}
          </div>
          <span className="hidden font-mono text-accent sm:block">CSV Export</span>
        </div>
      </div>

      <div className="hero-visual-badge absolute -right-4 -top-5 hidden items-center gap-2 rounded-2xl border border-white/10 bg-card/90 px-3 py-2.5 shadow-xl backdrop-blur-xl sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/20 text-accent"><Wand2 className="h-4 w-4" /></span>
        <span><span className="block text-2xs font-semibold text-foreground">AI auto-tagging</span><span className="block text-3xs text-muted-foreground">50 keywords found</span></span>
      </div>
    </div>
  );
}
