import { prisma } from '@/lib/db';
import { HomepageClient } from '@/components/admin/homepage-client';

const SECTIONS = [
  { key: 'hero', label: 'Hero Section', icon: 'Layout' },
  { key: 'features', label: 'Features Grid', icon: 'Grid' },
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
