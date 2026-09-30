import { redirect } from 'next/navigation';
import getServerSession from '@/lib/server-session';
import { prisma } from '@/lib/db';
import { getBatchLimitForUser } from '@/lib/generator/limits';
import { getToolCost } from '@/lib/credits/cost';
import { ImageToPrompt } from '@/components/dashboard/image-to-prompt';

export default async function ImageToPromptPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect('/login');

  const [batchLimit, costPerImage] = await Promise.all([
    getBatchLimitForUser(user.id),
    getToolCost('image-to-prompt'),
  ]);

  return <ImageToPrompt batchLimit={batchLimit} costPerImage={costPerImage} userId={user.id} />;
}
