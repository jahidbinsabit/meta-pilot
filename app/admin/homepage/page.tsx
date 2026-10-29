import { prisma } from '@/lib/db';
import { HomepageClient } from '@/components/admin/homepage-client';

// Authenticated page: never prerender at build time (needs session + DB).
export const dynamic = 'force-dynamic';

// T4-52: the marketing homepage renders SEVEN sections; howItWorks,
// stats and beforeAfter were missing here, so they could never be edited.
const SECTIONS = [
  { key: 'hero', label: 'Hero Section', icon: 'Layout' },
  { key: 'features', label: 'Features Grid', icon: 'Grid' },
  { key: 'howItWorks', label: 'How It Works', icon: 'ListOrdered' },
  { key: 'stats', label: 'Stats Strip', icon: 'BarChart3' },
  { key: 'beforeAfter', label: 'Before / After', icon: 'Columns2' },
  { key: 'testimonials', label: 'Testimonials', icon: 'MessageSquare' },
  { key: 'faq', label: 'FAQ', icon: 'HelpCircle' },
];

export default async function AdminHomepagePage() {
  const rows = await prisma.homepageContent.findMany({
    where: { sectionKey: { in: SECTIONS.map((s) => s.key) } },
  });

  const contentMap = rows.reduce(
    (map, row) => {
      map[row.sectionKey] = row;
      return map;
    },
    {} as Record<string, any>,
  );

  return <HomepageClient sections={SECTIONS} initialContent={contentMap} />;
}
