'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Lock,
  Coins,
  Wrench,
  Palette,
  Image,
  Type,
  Hash,
  Contrast,
  Download,
  Eraser,
  Grid3x3,
  Calendar,
  Key,
  FileImage,
  Dot,
  Layers,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Shared shell for every /dashboard/tools/[slug] page.
 *
 * Renders the tool's icon/name/description header, a back link, the credit
 * cost badge, and an optional "locked" banner for disabled tools. Each tool
 * page composes its own body inside this shell so the header, credit
 * contract, and empty-state patterns stay consistent.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Wrench,
  Palette,
  Image,
  Type,
  Hash,
  Contrast,
  Download,
  Eraser,
  Grid3x3,
  Calendar,
  Key,
  FileImage,
  Dot,
  Layers,
  Sparkles,
};

function iconFor(name: string) {
  return ICONS[name] ?? Wrench;
}

interface ToolShellProps {
  tool: {
    slug: string;
    name: string;
    description: string;
    icon: string;
    creditCost: number;
    isFree: boolean;
  };
  children: React.ReactNode;
  extraActions?: React.ReactNode;
}

export function ToolShell({ tool, children, extraActions }: ToolShellProps) {
  const Icon = iconFor(tool.icon);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/tools"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All tools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">{tool.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{tool.description}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {extraActions}
            <Badge variant={tool.isFree ? 'success' : 'info'} className="gap-1">
              {tool.isFree ? (
                <>
                  <Coins className="h-3 w-3" />
                  Free
                </>
              ) : (
                `${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'}`
              )}
            </Badge>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** A locked tile shown in the grid when an admin has disabled a tool. */
export function LockedToolTile({
  tool,
}: {
  tool: { name: string; description: string; icon: string };
}) {
  const Icon = iconFor(tool.icon);
  return (
    <div
      className="relative flex h-full cursor-not-allowed flex-col rounded-xl border border-border bg-card/60 p-5 opacity-70"
      aria-disabled
    >
      <div className="absolute right-3 top-3">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 font-semibold">{tool.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
      <span className="mt-auto pt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        Disabled by admin
      </span>
    </div>
  );
}
