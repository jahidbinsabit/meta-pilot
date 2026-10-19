'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, Sparkles, Image as ImageIcon, Key, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'metapilot-onboarding-dismissed';
const DONE_KEY = 'metapilot-onboarding-done';

type Step = {
  id: string;
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  {
    id: 'generate-metadata',
    title: 'Generate your first metadata',
    desc: 'Create AI titles, descriptions & keywords',
    href: '/dashboard/generate',
    icon: Sparkles,
  },
  {
    id: 'image-to-prompt',
    title: 'Try image-to-prompt',
    desc: 'Extract prompts from your images',
    href: '/dashboard/generate?tab=prompt',
    icon: ImageIcon,
  },
  {
    id: 'api-key',
    title: 'Add your API key',
    desc: 'Use your own Gemini/OpenAI key (BYOK)',
    href: '/dashboard/settings',
    icon: Key,
  },
  {
    id: 'invite',
    title: 'Invite a friend',
    desc: 'Share Meta CSV with a fellow creator',
    href: '/dashboard/settings',
    icon: Users,
  },
];

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = React.useState(true); // hidden until mount check
  const [done, setDone] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
      const saved = window.localStorage.getItem(DONE_KEY);
      setDone(saved ? JSON.parse(saved) : {});
      setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }, []);

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setDismissed(true);
  };

  if (dismissed) return null;
  const completedCount = STEPS.filter((s) => done[s.id]).length;
  if (completedCount === STEPS.length) return null;

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">
          Get started ({completedCount}/{STEPS.length})
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={dismiss} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {STEPS.map((step) => {
          const isDone = !!done[step.id];
          return (
            <div
              key={step.id}
              className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/10"
            >
              <button
                onClick={() => toggleDone(step.id)}
                aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                className="shrink-0"
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              <step.icon className="h-4 w-4 shrink-0 text-accent" />
              <Link href={step.href} className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                  {step.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">{step.desc}</p>
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
