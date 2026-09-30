'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

const CreditsContext = React.createContext<number | null>(null);

export function useCredits() {
  const v = React.useContext(CreditsContext);
  if (v === null) throw new Error('useCredits must be inside CreditsProvider');
  return { credits: v };
}

export function CreditsProvider({
  initialCredits,
  children,
}: {
  initialCredits: number;
  children: React.ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await fetch('/api/credits');
      if (!res.ok) return initialCredits;
      const j = await res.json();
      return j.credits as number;
    },
    initialData: initialCredits,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  return (
    <CreditsContext.Provider value={data ?? initialCredits}>{children}</CreditsContext.Provider>
  );
}
