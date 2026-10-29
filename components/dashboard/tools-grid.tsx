'use client';

import * as React from 'react';
import Link from 'next/link';
import {
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
  Search,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LockedToolTile } from '@/components/dashboard/tool-shell';

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

/**
 * One grid row, pre-resolved by the server page: `locked` carries WHY a
 * tool can't be opened (T3-09 — disabled tools used to be filtered out
 * entirely, so the "locked, not broken" tile was unreachable and the
 * header copy was false; tier-locked tools from the Batch C gate are
 * shown the same way).
 */
export interface ToolGridItem {
  slug: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  isFree: boolean;
  locked: null | 'disabled' | 'tier';
  requiredTiers?: string[];
}

export function ToolsGrid({ tools }: { tools: ToolGridItem[] }) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const visible = q
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      )
    : tools;

  return (
    <div className="space-y-4">
      {/* T2-12: the tools index had no search/filter at all. */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools…"
          aria-label="Search tools"
          className="pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tools match “{query}”.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((tool) =>
            tool.locked ? (
              <LockedToolTile
                key={tool.slug}
                tool={tool}
                label={
                  tool.locked === 'tier'
                    ? tool.requiredTiers && tool.requiredTiers.length > 0
                      ? `Requires ${tool.requiredTiers.join(' / ')}`
                      : 'Plan upgrade required'
                    : 'Disabled by admin'
                }
              />
            ) : (
              <ToolGridTile key={tool.slug} tool={tool} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ToolGridTile({ tool }: { tool: ToolGridItem }) {
  const Icon = ICONS[tool.icon] ?? Wrench;

  return (
    <Link href={tool.route} className="group">
      <Card className="h-full transition-colors hover:border-accent/40">
        <CardHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle className="mt-3 flex items-center gap-2">
            {tool.name}
            {tool.isFree && (
              <Badge variant="success" className="text-[10px]">
                Free
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{tool.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
