'use client';

import * as React from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import { TargetPlatform } from '@/lib/generator/types';
import { cn } from '@/lib/utils';

interface KeywordChipsProps {
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
  maxKeywords: number;
  disabled?: boolean;
  platform?: TargetPlatform;
  placeholder?: string;
}

export const KeywordChips = React.memo(function KeywordChips({
  keywords,
  onKeywordsChange,
  maxKeywords,
  disabled = false,
  platform,
  placeholder = 'Add keyword...',
}: KeywordChipsProps) {
  const [inputVal, setInputVal] = React.useState('');

  const handleAdd = (val: string) => {
    if (disabled) return;
    const cleaned = val.trim().replace(/^,+|,+$/g, '').trim();
    if (!cleaned) return;
    if (keywords.length >= maxKeywords) return;
    if (keywords.includes(cleaned)) {
      setInputVal('');
      return;
    }
    onKeywordsChange([...keywords, cleaned]);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAdd(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && keywords.length > 0) {
      e.preventDefault();
      onKeywordsChange(keywords.slice(0, -1));
    }
  };

  const removeAt = (index: number) => {
    if (disabled) return;
    const updated = keywords.filter((_, i) => i !== index);
    onKeywordsChange(updated);
  };

  const isAdobe = platform === 'adobe';

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-2.5 border border-border/60 transition-colors',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {keywords.map((kw, i) => {
          const isTop10Adobe = isAdobe && i < 10;
          return (
            <span
              key={`${kw}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs text-foreground shadow-sm border border-border/80 transition-all',
                isTop10Adobe && 'border-accent/50 bg-accent/5',
              )}
            >
              {isTop10Adobe && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-accent" title="Top 10 priority keyword for Adobe" />
              )}
              <span>{kw}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="text-muted-foreground hover:text-foreground focus:outline-none ml-0.5"
                  aria-label={`Remove keyword ${kw}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}

        {!disabled && keywords.length < maxKeywords && (
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputVal) handleAdd(inputVal);
            }}
            placeholder={keywords.length === 0 ? placeholder : 'Add keyword...'}
            className="min-w-[120px] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none px-1 py-1"
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
        <span>
          {keywords.length} / {maxKeywords} keywords
        </span>
        {isAdobe && (
          <span className="text-accent font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Top 10 keywords rank highest on Adobe Stock
          </span>
        )}
      </div>
    </div>
  );
});
