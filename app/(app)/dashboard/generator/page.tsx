import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { getGeneratorSettings } from '@/lib/generator/settings';
import { getBatchLimitForUser } from '@/lib/generator/limits';
import { MetadataGenerator } from '@/components/dashboard/metadata-generator';

export default async function GeneratorPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect('/login');

  const [settings, batchLimit] = await Promise.all([
    getGeneratorSettings(),
    getBatchLimitForUser(user.id),
  ]);

  return (
    <MetadataGenerator
      initialSettings={settings}
      batchLimit={batchLimit}
      initialCredits={user.credits}
      user={{ id: user.id, email: user.email, name: user.name }}
    />
  );
}
