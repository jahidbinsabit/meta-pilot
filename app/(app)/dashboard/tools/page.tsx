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
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { listTools, type ToolEntry } from '@/lib/tools/registry';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export default async function ToolsPage() {
  const tools = await listTools();
  const visible = tools.filter((t) => t.isEnabled);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Tools</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
          All Tools Collection
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every tool is a real, working page. Disabled tools are locked, not broken.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((tool) => (
          <ToolGridTile key={tool.slug} tool={tool} />
        ))}
      </div>
    </div>
  );
}

function ToolGridTile({ tool }: { tool: ToolEntry }) {
  if (!tool.isEnabled) {
    return (
      <LockedToolTile tool={{ name: tool.name, description: tool.description, icon: tool.icon }} />
    );
  }

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
