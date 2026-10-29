/**
 * Shared homepage default content.
 *
 * Single source of truth for the marketing homepage sections. Used by:
 * - app/(marketing)/page.tsx — public homepage (fallback when DB is empty)
 * - components/admin/homepage-client.tsx — CMS editor (initial values when DB is empty)
 *
 * Keeping them in one place guarantees the editor shows exactly what the
 * public page displays, so admins can see and edit the real content.
 */
export const HOMEPAGE_DEFAULTS: Record<string, any> = {
  hero: {
    headline: 'Batch AI Metadata for Stock Creators',
    subheadline:
      'Upload up to 100 images at once and get platform-ready titles, descriptions, and keywords — then export CSVs formatted for Adobe Stock, Shutterstock, and more, with Adobe Stock analytics showing what actually sells.',
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
          'Queue up to 100 images in one batch and let them process while you work on something else.',
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
      { value: '100', suffix: 'files', label: 'batch process in one go' },
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
    withTitle: 'With MetaCSV',
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
        quote: "MetaCSV cut my metadata time by 70%. I'm shipping 3x more images now.",
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
          'The Free plan includes 5 free credits every day — no card required. Each metadata generation costs 1 credit.',
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
