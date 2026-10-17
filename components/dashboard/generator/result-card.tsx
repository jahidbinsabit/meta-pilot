'use client';

import * as React from 'react';
import {
  Sparkles,
  Trash2,
  Edit2,
  Copy,
  Check,
  Loader2,
  Tag,
  FileText,
  AlertCircle,
  ImageIcon,
} from 'lucide-react';
import { UploadedFile, GeneratedRow, PlatformConfig } from '@/lib/generator/types';
import { KeywordChips } from './keyword-chips';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ResultCardProps {
  file?: UploadedFile;
  row?: GeneratedRow;
  isGenerating: boolean;
  includeDescription: boolean;
  currentPlatformConfig: PlatformConfig;
  onUpdateRow: (id: string, field: keyof GeneratedRow, value: any) => void;
  onRemove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCopyTitle: (title: string, id: string) => void;
  onCopyKeywords: (keywords: string[], id: string) => void;
  copiedId: string | null;
}

export const ResultCard = React.memo(function ResultCard({
  file,
  row,
  isGenerating,
  includeDescription,
  currentPlatformConfig,
  onUpdateRow,
  onRemove,
  onRegenerate,
  onCopyTitle,
  onCopyKeywords,
  copiedId,
}: ResultCardProps) {
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [isEditingDesc, setIsEditingDesc] = React.useState(false);

  const id = file?.id || row?.id || '';
  const fileName = file?.name || row?.fileName || 'Untitled';
  const previewSrc = file?.dataUrl || file?.previewUrl || '';
  const status = row ? row.status : 'ready';
  const hasResult = !!row && status === 'complete';
  const isFailed = !!row && status === 'failed';
  const errorMessage = row?.error;

  const title = row?.title || '';
  const description = row?.description || '';
  const keywords = row?.keywords || [];

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const originalSizeStr = formatSize(file?.size);

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card p-4 transition-all duration-200 shadow-sm hover:border-accent/40',
        isGenerating && 'ring-1 ring-accent/40 animate-pulse',
      )}
    >
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Thumbnail & Metadata (~240px) */}
        <div className="w-full lg:w-[240px] shrink-0 space-y-2.5">
          <div className="relative aspect-square w-full rounded-xl bg-muted/50 border border-border/80 overflow-hidden flex items-center justify-center p-2">
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc}
                alt={fileName}
                className="h-full w-full object-contain rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground/50">
                <ImageIcon className="h-8 w-8 mb-1" />
                <span className="text-[10px]">No Preview</span>
              </div>
            )}

            {/* Float Delete Button */}
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors shadow-sm"
              aria-label="Remove file"
              title="Remove file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-1 px-0.5">
            <p className="truncate text-[12px] font-medium text-foreground" title={fileName}>
              {fileName}
            </p>
            {originalSizeStr && (
              <p className="text-[11px] text-muted-foreground">
                Size: {originalSizeStr}
              </p>
            )}
            <div className="pt-1">
              <Badge variant="secondary" className="text-[10px] font-normal">
                {currentPlatformConfig.shortLabel}
              </Badge>
            </div>
          </div>
        </div>
        {/* Right Column: Content Fields (flex-1) */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          {/* Failed Banner if error */}
          {isFailed && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{errorMessage || 'Generation failed. Please try again.'}</span>
            </div>
          )}

          {/* Generating Shimmer overlay or state */}
          {isGenerating ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span className="text-xs font-medium text-accent">Generating metadata with AI...</span>
              </div>
              <div className="space-y-2.5">
                <div className="ai-skeleton-bar h-10 w-full rounded-lg" />
                {includeDescription && <div className="ai-skeleton-bar h-14 w-full rounded-lg" />}
                <div className="ai-skeleton-bar h-16 w-full rounded-lg" />
              </div>
            </div>
          ) : (
            <>
              {/* 1. Title Header & Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <FileText className="h-3.5 w-3.5 text-accent" />
                    <span>Title</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {title.length} chars
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasResult && !title}
                      onClick={() => setIsEditingTitle(!isEditingTitle)}
                      className="h-6 px-2 text-[11px] gap-1"
                      aria-label={isEditingTitle ? 'Lock title' : 'Edit title'}
                    >
                      <Edit2 className="h-3 w-3" />
                      {isEditingTitle ? 'Lock' : 'Edit'}
                    </Button>
                  </div>
                </div>

                <textarea
                  value={title}
                  readOnly={!isEditingTitle}
                  onChange={(e) => onUpdateRow(id, 'title', e.target.value)}
                  placeholder="Title will appear here..."
                  rows={2}
                  className={cn(
                    'w-full rounded-lg bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors resize-none border border-border/40',
                    isEditingTitle ? 'focus:border-accent bg-background' : 'cursor-default',
                    !hasResult && !title && 'opacity-60',
                  )}
                />
              </div>
              {/* 2. Description Block (Conditional) */}
              {includeDescription && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span>Description</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {description.length} chars
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!hasResult && !description}
                        onClick={() => setIsEditingDesc(!isEditingDesc)}
                        className="h-6 px-2 text-[11px] gap-1"
                        aria-label={isEditingDesc ? 'Lock description' : 'Edit description'}
                      >
                        <Edit2 className="h-3 w-3" />
                        {isEditingDesc ? 'Lock' : 'Edit'}
                      </Button>
                    </div>
                  </div>

                  <textarea
                    value={description}
                    readOnly={!isEditingDesc}
                    onChange={(e) => onUpdateRow(id, 'description', e.target.value)}
                    placeholder="Description will appear here..."
                    rows={2}
                    className={cn(
                      'w-full rounded-lg bg-muted px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors resize-none border border-border/40',
                      isEditingDesc ? 'focus:border-accent bg-background' : 'cursor-default',
                      !hasResult && !description && 'opacity-60',
                    )}
                  />
                </div>
              )}

              {/* 3. Keywords Header & Chips */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Tag className="h-3.5 w-3.5 text-accent" />
                  <span>Keywords ({keywords.length})</span>
                </div>

                <KeywordChips
                  keywords={keywords}
                  onKeywordsChange={(newKws) => onUpdateRow(id, 'keywords', newKws)}
                  maxKeywords={currentPlatformConfig.limits.keywordsMax}
                  disabled={!hasResult && keywords.length === 0}
                  platform={currentPlatformConfig.id}
                  placeholder={hasResult ? 'Add keyword...' : 'Keywords will appear here...'}
                />
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 mt-2">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                disabled={!hasResult}
                onClick={() => onCopyTitle(title, id)}
              >
                {copiedId === `title-${id}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy Title
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                disabled={!hasResult}
                onClick={() => onCopyKeywords(keywords, id)}
              >
                {copiedId === `kw-${id}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy Keywords
              </Button>
            </div>

            <Button
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => onRegenerate(id)}
              disabled={isGenerating}
            >
              <Sparkles className="h-3 w-3" />
              {isFailed ? 'Retry' : hasResult ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});


