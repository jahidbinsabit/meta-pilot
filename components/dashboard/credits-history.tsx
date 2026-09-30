'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

export function useCreditsHistory() {
  const { data } = useQuery({
    queryKey: ['credits-history'],
    queryFn: async () => {
      const res = await fetch('/api/credits/history');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });
  return { history: data || [] };
}
