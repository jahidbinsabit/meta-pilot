import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-handler';
import { prisma } from '@/lib/db';
import { ProfileClient } from '@/components/dashboard/profile-client';

export const metadata = { title: 'My Profile' };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      membership: true,
      credits: true,
      createdAt: true,
    },
  });

  if (!user) redirect('/login');

  return (
    <ProfileClient
      initialProfile={{
        ...user,
        name: user.name ?? null,
        image: user.image ?? null,
        createdAt: user.createdAt.toISOString(),
      }}
    />
  );
}
