'use client';

import * as React from 'react';
import { MetadataGenerator } from '@/components/dashboard/metadata-generator';
import { ImageToPrompt } from '@/components/dashboard/image-to-prompt';
import type { GeneratorSettings } from '@/lib/generator/types';
import { cn } from '@/lib/utils';

interface GenerateClientProps {
  initialSettings: GeneratorSettings;
  batchLimit: number;
  initialCredits: number;
  user: { id: string; email: string; name: string | null };
  costPerImage: number;
  defaultTab?: 'metadata' | 'prompt';
}

export function GenerateClient({
  initialSettings,
  batchLimit,
  initialCredits,
  user,
  costPerImage,
  defaultTab = 'metadata',
}: GenerateClientProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab);

  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="gen-ui mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className={cn(activeTab === 'metadata' ? 'block' : 'hidden')}>
        <MetadataGenerator
          initialSettings={initialSettings}
          batchLimit={batchLimit}
          initialCredits={initialCredits}
          user={user}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
      <div className={cn(activeTab === 'prompt' ? 'block' : 'hidden')}>
        <ImageToPrompt
          batchLimit={batchLimit}
          costPerImage={costPerImage}
          userId={user.id}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          user={user}
        />
      </div>
    </div>
  );
}
