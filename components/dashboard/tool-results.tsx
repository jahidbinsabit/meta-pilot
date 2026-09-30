'use client';

import * as React from 'react';
import { Copy, Check, Download, Image as ImageIcon, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Shared results UI pattern (PROMPT 4–5 / PROMPT 10).
 *
 * Every creative tool renders its output through one of these three
 * primitives so the "done" state looks the same across the suite:
 *   - <ResultsList>   — a list of text/string results with per-row copy
 *   - <ImageResults>  — a list of image results with per-row download
 *   - <PaletteResults>— a color swatch grid with hex codes + copy
 */

interface ResultsListProps {
  rows: { id: string; label: string; text: string }[];
  onExport?: () => void;
  exportLabel?: string;
}

export function ResultsList({ rows, onExport, exportLabel = 'Export' }: ResultsListProps) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
        <FileText className="h-10 w-10 opacity-40" />
        <p className="mt-2 text-sm">Output will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border border-border bg-card-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{r.label}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => copy(r.id, r.text)}
              aria-label={`Copy ${r.label}`}
            >
              {copied === r.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === r.id ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="mt-1.5 max-h-[320px] overflow-auto whitespace-pre-wrap text-sm text-foreground">
            {r.text}
          </pre>
        </div>
      ))}
      {onExport && (
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          {exportLabel}
        </Button>
      )}
    </div>
  );
}

interface ImageResultsProps {
  rows: { id: string; label: string; dataUrl: string }[];
  onExportAll?: () => void;
}

export function ImageResults({ rows, onExportAll }: ImageResultsProps) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
        <ImageIcon className="h-10 w-10 opacity-40" />
        <p className="mt-2 text-sm">No images yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="overflow-hidden rounded-lg border border-border bg-card-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.dataUrl} alt={r.label} className="aspect-square w-full object-cover" />
            <div className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 truncate text-xs text-muted-foreground">{r.label}</span>
              <a
                href={r.dataUrl}
                download={r.label}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Download ${r.label}`}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
      {onExportAll && (
        <Button variant="outline" size="sm" onClick={onExportAll}>
          <Download className="h-4 w-4" />
          Download all (ZIP)
        </Button>
      )}
    </div>
  );
}

interface PaletteResultsProps {
  colors: { hex: string; rgb: string; name?: string }[];
  onCopy?: (hex: string) => void;
}

export function PaletteResults({ colors, onCopy }: PaletteResultsProps) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopied(hex);
    onCopy?.(hex);
    setTimeout(() => setCopied(null), 1500);
  };

  if (colors.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <p className="mt-2 text-sm">No palette extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {colors.map((c) => (
          <button
            key={c.hex}
            type="button"
            onClick={() => copy(c.hex)}
            className="group flex flex-col overflow-hidden rounded-lg border border-border"
            aria-label={`Copy ${c.hex}`}
          >
            <div
              className="aspect-square w-full border-b border-black/10"
              style={{ backgroundColor: c.hex }}
            />
            <div className="p-2 text-left">
              <p className="font-mono text-xs text-foreground">{c.hex}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.rgb}
                {c.name ? ` · ${c.name}` : ''}
              </p>
            </div>
          </button>
        ))}
      </div>
      {copied && (
        <p className="text-xs text-muted-foreground">
          Copied <span className="font-mono text-foreground">{copied}</span> to clipboard
        </p>
      )}
    </div>
  );
}
