'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  Copy,
  Download,
  Sparkles,
  X,
  Twitter,
  Linkedin,
  MessageCircle,
  FileText,
  Tag,
  Type,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GeneratedRow, ExportFormat, TargetPlatform } from '@/lib/generator/types';
import { PLATFORMS } from '@/lib/generator/types';

interface Props {
  open: boolean;
  onClose: () => void;
  rows: GeneratedRow[];
  platform: TargetPlatform;
  exportFormat: ExportFormat;
  isExporting: boolean;
  onExport: () => void;
}

const PLATFORM_ICONS: Record<TargetPlatform, string> = {
  adobe: '🎨', shutterstock: '📸', freepik: '🖼️', vecteezy: '✏️', istock: '📷', generic: '🌐',
};

export function MetadataSuccessModal({
  open, onClose, rows, platform, exportFormat, isExporting, onExport,
}: Props) {
  const [copiedLink, setCopiedLink] = React.useState(false);

  const completeRows = rows.filter((r) => r.status === 'complete');
  const failedRows = rows.filter((r) => r.status === 'failed');
  const totalKeywords = completeRows.reduce((acc, r) => acc + r.keywords.length, 0);
  const avgKeywords = completeRows.length > 0 ? Math.round(totalKeywords / completeRows.length) : 0;
  const platformConfig = PLATFORMS[platform];
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  }

  function openSocialShare(net: 'twitter' | 'linkedin' | 'whatsapp') {
    const text = `Generated metadata for ${completeRows.length} images on ${platformConfig.label} ✨`;
    const encoded = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(shareUrl);
    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encoded}%20${encodedUrl}`,
    };
    window.open(urls[net], '_blank', 'noopener,noreferrer,width=550,height=450');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full max-w-sm overflow-hidden p-0 gap-0">
        <div className="relative bg-gradient-to-br from-accent/15 to-transparent px-4 pt-5 pb-3">
          <DialogClose className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </DialogClose>

          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-5 w-5 text-emerald-400" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">Complete</p>
              <DialogTitle className="text-base font-bold text-foreground">Metadata Ready!</DialogTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {completeRows.length} image{completeRows.length !== 1 ? 's' : ''} for {platformConfig.shortLabel}
                {failedRows.length > 0 && <span className="text-amber-400"> · {failedRows.length} failed</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-card/30">
          {[
            { icon: <FileText className="h-3 w-3" />, label: 'Images', value: completeRows.length },
            { icon: <Tag className="h-3 w-3" />, label: 'Keywords', value: totalKeywords },
            { icon: <Type className="h-3 w-3" />, label: 'Avg', value: avgKeywords },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-2.5">
              <span className="text-accent">{stat.icon}</span>
              <span className="text-lg font-bold tabular-nums text-foreground">{stat.value}</span>
              <span className="text-[9px] font-medium uppercase text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card-2 px-3 py-2">
            <span className="text-base">{PLATFORM_ICONS[platform]}</span>
            <span className="flex-1 text-[11px] font-semibold text-foreground">{platformConfig.label}</span>
            <Badge variant="success" className="text-[9px] px-1.5 py-0.5">
              <Sparkles className="h-2.5 w-2.5" /> AI
            </Badge>
          </div>

          <Button
            className="w-full h-9 text-[12px]"
            onClick={onExport}
            disabled={isExporting || completeRows.length === 0}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isExporting ? 'Exporting...' : 'Download CSV'}
          </Button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium transition-all',
                copiedLink
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground',
              )}
            >
              {copiedLink ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy Link</>}
            </button>

            <div className="flex gap-1">
              {(
                [
                  { id: 'twitter' as const, icon: <Twitter className="h-3.5 w-3.5" />, color: 'text-[#1d9bf0]' },
                  { id: 'linkedin' as const, icon: <Linkedin className="h-3.5 w-3.5" />, color: 'text-[#0a66c2]' },
                  { id: 'whatsapp' as const, icon: <MessageCircle className="h-3.5 w-3.5" />, color: 'text-[#25d366]' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSocialShare(s.id)}
                  className={cn(
                    'flex items-center justify-center rounded-lg border border-border bg-card p-2 transition-all hover:scale-105 active:scale-95',
                    s.color,
                  )}
                >
                  {s.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2 bg-card/50">
          <p className="text-[10px] text-muted-foreground">{completeRows.length} ready</p>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={onClose}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

