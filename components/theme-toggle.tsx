'use client';

import * as React from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'metapilot-theme';

function getInitialTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    // Reconcile the DOM with the resolved theme on mount: the pre-paint
    // script normally applies the class, but if it was skipped (cached
    // HTML, blocked inline script) the toggle state and the rendered
    // theme could disagree — and disagree differently per page. Syncing
    // here makes every surface converge on the same stored preference.
    document.documentElement.classList.toggle('light', initial === 'light');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  if (!mounted) {
    // Render a placeholder to avoid hydration mismatch; real icon after mount.
    return (
      <button
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground',
          className
        )}
        aria-label="Toggle theme"
        disabled
      >
        <Moon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors',
        className
      )}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
