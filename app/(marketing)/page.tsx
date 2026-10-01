import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Sparkles,
  Image,
  BarChart3,
  Wrench,
  Zap,
  ArrowRight,
  Star,
  CheckCircle,
  Upload,
  Wand2,
  Edit3,
  Download,
  ChevronRight,
  Quote,
  Play,
  Shield,
  Clock,
  Layers,
  FileText,
  Key,
} from 'lucide-react';
import { prisma } from '@/lib/db';

const DEFAULTS: Record<string, any> = {
  hero: {
    headline: 'StockForge AI',
    subheadline:
      'Generate AI metadata for your stock images, craft prompts from them, and understand the market — all in one dashboard built for stock-content creators.',
    ctaPrimary: { label: 'Start free', href: '/login' },
    ctaSecondary: { label: 'View pricing', href: '/pricing' },
    badge: 'New: Adobe Stock analytics now in beta',
  },
  features: {
    items: [
      {
        icon: 'Sparkles',
        title: 'Metadata Generator',
        description:
          'AI writes SEO-optimized titles, descriptions, and keyword sets tuned for Adobe Stock, Shutterstock, and Vecteezy.',
      },
      {
        icon: 'Image',
        title: 'Image → Prompt',
        description:
          'Reverse-engineer an image into a detailed generation prompt — perfect for recreating a style.',
      },
      {
        icon: 'BarChart3',
        title: 'Adobe Analytics',
        description:
          'Track downloads, revenue, views, and shares. Spot trends before your competitors.',
      },
      {
        icon: 'Wrench',
        title: 'Creative Micro-Tools',
        description:
          'A growing suite: keyword clustering, title A/B, alt-text, color palette extraction, and more.',
      },
      {
        icon: 'Zap',
        title: 'Batch Generation',
        description:
          'Queue hundreds of images through BullMQ workers. Process entire folders overnight.',
      },
      {
        icon: 'Star',
        title: 'Multi-Tenant & Secure',
        description: 'Per-user credits, API keys, and data isolation. Your work stays yours.',
      },
    ],
  },
  howItWorks: {
    steps: [
      {
        number: '01',
        title: 'Upload Your Assets',
        description:
          'Drag and drop images, videos, vectors, or entire folders. Batch upload 100+ files at once. Supports JPG, PNG, WebP, EPS, AI, SVG, MP4, and more.',
        icon: 'Upload',
      },
      {
        number: '02',
        title: 'AI Analyzes and Generates',
        description:
          'Our AI analyzes every file and generates SEO-optimized titles, rich descriptions, and up to 50 ranked keywords — tailored to each platform\'s requirements.',
        icon: 'Wand2',
      },
      {
        number: '03',
        title: 'Review, Refine and Check Quality',
        description:
          'Edit metadata inline, use bulk editor for batch changes, check confidence scores and risk flags per asset. Get platform readiness ratings before upload.',
        icon: 'Edit3',
      },
      {
        number: '04',
        title: 'Embed and Export',
        description:
          'Ready metadata embeds directly into your files. Export platform-ready CSVs for Adobe Stock, Freepik, Shutterstock, Dreamstime, 123RF, and Vecteezy in seconds.',
        icon: 'Download',
      },
    ],
  },
  stats: {
    items: [
      { value: '50', suffix: 'keywords', label: 'SEO-ranked per asset' },
      { value: '500+', suffix: 'files', label: 'batch process in one go' },
      { value: '<10', suffix: 'seconds', label: 'per asset, end to end' },
      { value: '6', suffix: 'AI models', label: 'choose what you use' },
    ],
  },
  beforeAfter: {
    withoutTitle: 'Without Automation',
    withoutPoints: [
      'Type titles one by one — 5-10 minutes per file',
      'Copy-paste keywords manually from notes',
      'Get rejected because of trademarked keywords',
      'Re-enter metadata on every stock platform',
      'No way to batch process — one file at a time',
      "Guess what keywords will rank — no data",
    ],
    withTitle: 'With StockForge AI',
    withPoints: [
      'AI generates title, description and 50 keywords instantly',
      'Keywords ranked by SEO weight — best ones first',
      'Trademark sniffer auto-removes brand names',
      'Metadata embeds into files — platforms read it automatically',
      'Process hundreds of files in one batch',
      'Confidence scores and risk analysis per asset',
    ],
  },
  testimonials: {
    items: [
      {
        name: 'Sarah Chen',
        role: 'Adobe Stock Creator',
        quote: "StockForge cut my metadata time by 70%. I'm shipping 3x more images now.",
        avatar: 'SC',
        rating: 5,
      },
      {
        name: 'Marcus Williams',
        role: 'Shutterstock Pro',
        quote: 'The Adobe analytics integration is a game-changer. Finally understand what sells.',
        avatar: 'MW',
        rating: 5,
      },
      {
        name: 'Priya Kapoor',
        role: 'Vecteezy Contributor',
        quote: 'Worth every credit. The batch generation alone saves me hours each week.',
        avatar: 'PK',
        rating: 5,
      },
    ],
  },
  faq: {
    items: [
      {
        question: 'How many free credits do I get?',
        answer:
          '20 free credits on sign-up. Each metadata generation costs 1 credit. Free tier renews monthly.',
      },
      {
        question: 'Can I use my own API keys?',
        answer:
          'Yes! You can connect your own OpenAI or Gemini keys to use your quota instead of ours.',
      },
      {
        question: 'What about data privacy?',
        answer:
          'All images and metadata stay in your account. We never use your data for training or analytics.',
      },
      {
        question: 'Is there an API?',
        answer: 'Yes. Pro+ plans include API access. Contact sales for enterprise integration.',
      },
    ],
  },
};

const ICON_MAP: Record<string, any> = {
  Sparkles,
  Image,
  BarChart3,
  Wrench,
  Zap,
  Star,
  Upload,
  Wand2,
  Edit3,
  Download,
  CheckCircle,
  Shield,
  Clock,
  Layers,
  FileText,
  Key,
};

async function getHomepageContent() {
  try {
    const rows = await prisma.homepageContent.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.reduce(
      (content, row) => ({ ...content, [row.sectionKey]: row.contentJson }),
      {} as Record<string, any>,
    );
  } catch (error) {
    console.error('Error fetching homepage content:', error);
    return {};
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'default' } });
    if (settings && settings.metaTitle) {
      return {
        title: settings.metaTitle,
        description:
          settings.metaDescription ||
          'AI-powered metadata generation, image-to-prompt, and Adobe Stock analytics for stock content creators.',
        openGraph: {
          title: settings.metaTitle,
          description:
            settings.metaDescription ||
            'AI-powered metadata generation for stock content creators.',
          type: 'website',
          images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
        },
        twitter: {
          card: 'summary_large_image',
          title: settings.metaTitle,
          description:
            settings.metaDescription ||
            'AI-powered metadata generation for stock content creators.',
          images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
          creator: settings.twitterHandle ?? undefined,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching site settings for metadata:', error);
  }

  // Fallback to hardcoded defaults
  return {
    title: 'StockForge AI — AI Metadata for Stock Content Creators',
    description:
      'AI-powered metadata generation, image-to-prompt, and Adobe Stock analytics for stock content creators. Generate SEO-optimized titles, descriptions, and keywords.',
    openGraph: {
      title: 'StockForge AI — AI Metadata for Stock Content Creators',
      description: 'AI-powered metadata generation for stock content creators.',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'StockForge AI — AI Metadata for Stock Content Creators',
      description: 'AI-powered metadata generation for stock content creators.',
    },
  };
}

export default async function HomePage() {
  const dbContent = await getHomepageContent();
  const hero = dbContent.hero || DEFAULTS.hero;
  const features = dbContent.features || DEFAULTS.features;
  const howItWorks = dbContent.howItWorks || DEFAULTS.howItWorks;
  const stats = dbContent.stats || DEFAULTS.stats;
  const beforeAfter = dbContent.beforeAfter || DEFAULTS.beforeAfter;
  const testimonials = dbContent.testimonials || DEFAULTS.testimonials;
  const faq = dbContent.faq || DEFAULTS.faq;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stockforge.ai';

  return (
    <div className="flex flex-col">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'StockForge AI',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description:
              'AI-powered metadata generation, image-to-prompt, and Adobe Stock analytics for stock content creators.',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            url: baseUrl,
            provider: { '@type': 'Organization', name: 'StockForge AI' },
          }),
        }}
      />

            {/* ====== HERO SECTION - Enhanced ====== */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.1),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="max-w-3xl">
            {hero.badge && (
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent animate-fade-in">
                <Star className="h-3 w-3" /> {hero.badge}
              </div>
            )}
            <h1
              className="mt-6 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              {hero.headline}
            </h1>
            <p
              className="mt-6 text-lg text-muted-foreground sm:text-xl max-w-2xl animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              {hero.subheadline}
            </p>
            <div
              className="mt-8 flex flex-wrap gap-4 animate-fade-in"
              style={{ animationDelay: '0.3s' }}
            >
              {hero.ctaPrimary && (
                <Link
                  href={hero.ctaPrimary.href || '/login'}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent/90 hover:scale-[1.02] transition-all"
                >
                  {hero.ctaPrimary.label} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              {hero.ctaSecondary && (
                <Link
                  href={hero.ctaSecondary.href || '/pricing'}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3 text-sm font-semibold text-foreground hover:bg-card hover:border-accent/30 transition-all"
                >
                  {hero.ctaSecondary.label}
                </Link>
              )}
            </div>
            <div
              className="mt-6 flex items-center gap-4 text-sm text-muted-foreground animate-fade-in"
              style={{ animationDelay: '0.4s' }}
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" /> 20 free credits
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" /> No card required
              </span>
            </div>
          </div>
        </div>
      </section>

      
      {/* ====== STATS SECTION ====== */}
      {stats.items && stats.items.length > 0 && (
        <section className="border-b border-border bg-gradient-to-r from-accent/5 via-transparent to-accent/5">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {stats.items.map((stat: any, idx: number) => (
                <div key={idx} className="text-center">
                  <div className="font-display text-4xl font-bold text-accent sm:text-5xl">
                    {stat.value}
                    <span className="text-lg sm:text-xl ml-1 text-muted-foreground">
                      {stat.suffix}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ====== HOW IT WORKS ====== */}
      {howItWorks.steps && howItWorks.steps.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                How It Works
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                From File to Upload-Ready in Four Steps
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
                Everything happens inside the app — no browser, no manual entry, no extra tools
                needed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {howItWorks.steps.map((step: any, idx: number) => {
                const Icon = ICON_MAP[step.icon] || Upload;
                return (
                  <div key={idx} className="relative group">
                    {idx < howItWorks.steps.length - 1 && (
                      <div className="hidden lg:block absolute top-12 left-[calc(100%+12px)] w-[calc(100%-24px)] h-px bg-gradient-to-r from-border to-transparent" />
                    )}

                    <div className="relative rounded-2xl border border-border bg-card/50 p-6 h-full transition-all group-hover:border-accent/40 group-hover:shadow-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className="font-display text-3xl font-bold text-accent/30">
                          {step.number}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ====== FEATURES ====== */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-xs font-medium uppercase tracking-widest text-accent">Features</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a stock creator needs
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.items?.map((f: any, idx: number) => {
            const Icon = ICON_MAP[f.icon] || Sparkles;
            return (
              <div
                key={idx}
                className="group rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:border-accent/40 hover:shadow-lg hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {f.description || f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

            {/* ====== BEFORE/AFTER COMPARISON ====== */}
      {beforeAfter.withoutTitle && beforeAfter.withTitle && (
        <section className="border-y border-border bg-gradient-to-b from-card/30 to-card">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                Why StockForge?
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                See What Changes
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
                From manual keyword entry to automated, AI-optimized metadata in minutes.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-red-500/20 bg-card/50 p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-500">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-bold">{beforeAfter.withoutTitle}</h3>
                </div>
                <ul className="space-y-3">
                  {beforeAfter.withoutPoints?.map((point: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-3 text-muted-foreground">
                      <div className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500/60 flex-shrink-0" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-card/50 p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-bold">{beforeAfter.withTitle}</h3>
                </div>
                <ul className="space-y-3">
                  {beforeAfter.withPoints?.map((point: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-3 text-foreground">
                      <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm font-medium">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ====== TESTIMONIALS ====== */}
      {testimonials.items && testimonials.items.length > 0 && (
        <section className="border-t border-border">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                Testimonials
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                What Contributors Say
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
                Join hundreds of stock contributors who have stopped doing metadata manually.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.items.map((t: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border bg-card p-8 shadow-card relative"
                >
                  <Star className="h-8 w-8 text-accent/20 absolute top-6 right-6" />
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating || 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                    ))}
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 pt-4 border-t border-border">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ====== PRICING TEASER ====== */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Pricing</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Credits that scale with you
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Pay only for what you generate. Starter packs, pro plans, and enterprise top-ups —
              all settled through Stripe or bKash/Nagad.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all hover:scale-[1.02]"
            >
              See plans <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ====== FAQ ====== */}
      {faq.items && faq.items.length > 0 && (
        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">FAQ</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Common questions
              </h2>
            </div>
            <div className="space-y-4">
              {faq.items.map((item: any, idx: number) => (
                <details
                  key={idx}
                  className="group rounded-xl border border-border bg-card/50 p-6 hover:border-accent/30 transition-colors"
                >
                  <summary className="flex cursor-pointer items-center justify-between font-semibold text-lg list-none">
                    {item.question}
                    <span className="transition-transform group-open:rotate-180">
                      <ArrowRight className="h-5 w-5 text-accent rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
