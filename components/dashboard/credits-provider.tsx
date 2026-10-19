'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

const CreditsContext = React.createContext<{ credits: number; unlimited: boolean } | null>(null);

export function useCredits() {
  const v = React.useContext(CreditsContext);
  if (v === null) throw new Error('useCredits must be inside CreditsProvider');
  return v;
}

export function CreditsProvider({
  initialCredits,
  initialUnlimited,
  children,
}: {
  initialCredits: number;
  initialUnlimited?: boolean;
  children: React.ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await fetch('/api/credits');
      if (!res.ok) return { credits: initialCredits, unlimited: initialUnlimited ?? false };
      const j = await res.json();
      return { credits: j.credits as number, unlimited: Boolean(j.unlimited) };
    },
    initialData: { credits: initialCredits, unlimited: initialUnlimited ?? false },
    refetchInterval: 30000,
    staleTime: 15000,
  });
  return (
    <CreditsContext.Provider value={data ?? { credits: initialCredits, unlimited: initialUnlimited ?? false }}>
      {children}
    </CreditsContext.Provider>
  );
}
