import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { getBatchLimitForUser } from '@/lib/generator/limits';
import { getToolCost } from '@/lib/credits/cost';
import { GenerateClient } from '@/components/dashboard/generate-client';

interface GeneratePageProps {
  searchParams: { tab?: string };
}

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect('/login');

  const [settings, batchLimit, costPerImage] = await Promise.all([
    getGeneratorSettings(),
    getBatchLimitForUser(user.id),
    getToolCost('image-to-prompt'),
  ]);

  const defaultTab = searchParams.tab === 'prompt' ? 'prompt' : 'metadata';

  return (
    <GenerateClient
      initialSettings={settings}
      batchLimit={batchLimit}
      initialCredits={user.credits}
      user={{ id: user.id, email: user.email, name: user.name }}
      costPerImage={costPerImage}
      defaultTab={defaultTab}
    />
  );
}
