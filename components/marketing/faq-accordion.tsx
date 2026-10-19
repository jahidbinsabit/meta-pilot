'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FaqAccordion({ items }: { items: Array<{ question: string; answer: string }> }) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-4">
      {items.map((item, idx) => {
        const open = openIdx === idx;
        return (
          <div
            key={idx}
            className="rounded-xl border border-border bg-card/50 p-6 hover:border-accent/30 transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : idx)}
              aria-expanded={open}
              className="flex w-full cursor-pointer items-center justify-between text-left font-semibold text-lg"
            >
              <span>{item.question}</span>
              <span className={cn('shrink-0 transition-transform', open && 'rotate-180')}>
                <ChevronDown className="h-5 w-5 text-accent" />
              </span>
            </button>
            {open && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
