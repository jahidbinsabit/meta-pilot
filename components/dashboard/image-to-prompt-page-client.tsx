'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImageToPrompt } from '@/components/dashboard/image-to-prompt';

interface Props {
  batchLimit: number;
  costPerImage: number;
  user: { id: string; email: string; name: string | null };
}

export function ImageToPromptPageClient({ batchLimit, costPerImage, user }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<'metadata' | 'prompt'>('prompt');

  return (
    <div className="gen-ui mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ImageToPrompt
        batchLimit={batchLimit}
        costPerImage={costPerImage}
        userId={user.id}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'metadata') {
            router.push('/dashboard/generate');
          } else {
            setActiveTab(tab);
          }
        }}
        user={user}
      />
    </div>
  );
}
