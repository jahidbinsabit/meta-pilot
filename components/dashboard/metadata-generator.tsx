'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useCredits } from '@/components/dashboard/credits-provider';
import { isApiKeyError } from '@/lib/tools/client-api-key';
import { ApiKeyRequiredDialog } from '@/components/dashboard/api-key-required-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Upload, Copy, Trash2, Download, ChevronDown, ChevronUp, Layers, Loader2, StopCircle } from 'lucide-react';
import type {
  GeneratorSettings,
  UploadedFile,
  GeneratedRow,
  ExportFormat,
  TargetPlatform,
} from '@/lib/generator/types';
import { PLATFORMS } from '@/lib/generator/types';
import { csvFilename } from '@/lib/generator/csv';
import { MetadataSuccessModal } from '@/components/dashboard/metadata-success-modal';
import { ImageUploader } from '@/components/dashboard/image-uploader';
import { ControlsRail } from '@/components/dashboard/generator/controls-rail';
import { ResultCard } from '@/components/dashboard/generator/result-card';

interface Props {
  initialSettings: GeneratorSettings;
  batchLimit: number;
  initialCredits: number;
  user: { id: string; email: string; name: string | null; preferredAiProvider?: string };
  activeTab?: 'metadata' | 'prompt';
  onTabChange?: (tab: 'metadata' | 'prompt') => void;
}

export function MetadataGenerator({
  initialSettings,
  batchLimit,
  user,
  activeTab,
  onTabChange,
}: Props) {
  const [settings, setSettings] = React.useState<GeneratorSettings>(initialSettings);
  const [selectedPlatform, setSelectedPlatform] = React.useState<TargetPlatform>('adobe');
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [includeDescription, setIncludeDescription] = React.useState(
    settings.includeDescription !== false,
  );
  // Adobe Stock takes title + keywords only — no description. The stored
  // preference is preserved; Adobe generations/exports just skip it.
  const effectiveIncludeDescription = selectedPlatform === 'adobe' ? false : includeDescription;
  const [prefixText, setPrefixText] = React.useState(settings.prefix || '');
  const [suffixText, setSuffixText] = React.useState(settings.suffix || '');
  const [negWords, setNegWords] = React.useState<string[]>(settings.negativeTitleWords);
  const [negKws, setNegKws] = React.useState<string[]>(settings.negativeKeywords);
  const [prefixEnabled, setPrefixEnabled] = React.useState(!!settings.prefix);
  const [suffixEnabled, setSuffixEnabled] = React.useState(!!settings.suffix);
  const [negWordsEnabled, setNegWordsEnabled] = React.useState(
    settings.negativeTitleWords.length > 0,
  );
  const [negKwsEnabled, setNegKwsEnabled] = React.useState(settings.negativeKeywords.length > 0);
  const [rows, setRows] = React.useState<GeneratedRow[]>([]);
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>('adobe');
  const [exportCategory, setExportCategory] = React.useState('');
  const [exportReleases, setExportReleases] = React.useState('');
  const [sendEmail, setSendEmail] = React.useState(false);
  const [showExportPanel, setShowExportPanel] = React.useState(false);
  const [successModalOpen, setSuccessModalOpen] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [dropzoneExpanded, setDropzoneExpanded] = React.useState(true);

  // Set by stopGeneration() to halt job polling (the server-side job
  // keeps running; polling is only how the UI observes it).
  const stopRequestedRef = React.useRef(false);
  // ETA tracking: timestamps when each result arrives
  const genStartRef = React.useRef<number>(0);
  const completedCountRef = React.useRef<number>(0);

  const toast = useToast();
  const queryClient = useQueryClient();
  const { credits, unlimited } = useCredits();

  // Persist last-used settings per user (localStorage + server backup).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`generator-settings:${user.id}`);
      if (raw) {
        const saved = JSON.parse(raw);
        setSettings((s) => ({ ...s, ...saved }));
        if (saved.includeDescription !== undefined) {
          setIncludeDescription(saved.includeDescription);
        }
        if (saved.prefix !== undefined) {
          setPrefixText(saved.prefix || '');
          setPrefixEnabled(!!saved.prefix);
        }
        if (saved.suffix !== undefined) {
          setSuffixText(saved.suffix || '');
          setSuffixEnabled(!!saved.suffix);
        }
        if (saved.negativeTitleWords) setNegWords(saved.negativeTitleWords);
        if (saved.negativeKeywords) setNegKws(saved.negativeKeywords);
        if (saved.platform && PLATFORMS[saved.platform as TargetPlatform]) {
          setSelectedPlatform(saved.platform as TargetPlatform);
          setExportFormat(saved.platform as TargetPlatform);
        }
      }
    } catch {
      /* ignore */
    }
  }, [user.id]);

  function persistSettings(next: Partial<GeneratorSettings> & { platform?: TargetPlatform }) {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(
          `generator-settings:${user.id}`,
          JSON.stringify({
            ...merged,
            includeDescription: next.includeDescription ?? includeDescription,
            platform: next.platform || selectedPlatform,
          }),
        );
      } catch {
        /* ignore */
      }
      return merged;
    });
  }

  function handlePlatformChange(plat: TargetPlatform) {
    setSelectedPlatform(plat);
    setExportFormat(plat);
    const config = PLATFORMS[plat];
    if (config) {
      setSettings((prev) => {
        const updated = {
          ...prev,
          titleLength: config.defaultTitleLength,
          keywordsCount: config.defaultKeywordsCount,
        };
        persistSettings({ ...updated, platform: plat });
        return updated;
      });
    }
  }





  const [isGenerating, setIsGenerating] = React.useState(false);
  // Total images in the current run, captured at start. The progress bar
  // must use this — deriving it from the live file list double-counts
  // completed images (they stay in the list AND in completedCountRef).
  const [runTotal, setRunTotal] = React.useState(0);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  const [generatingIds, setGeneratingIds] = React.useState<Set<string>>(new Set());

  async function startStreamingGeneration() {
    const ready = files.filter((f) => f.status === 'done' && f.previewUrl);
    if (ready.length === 0) {
      toast({ title: 'No images ready', description: 'Upload images first', variant: 'error' });
      return;
    }

    stopRequestedRef.current = false;
    genStartRef.current = Date.now();
    completedCountRef.current = 0;

    setIsGenerating(true);
    setRunTotal(ready.length);
    setGeneratingIds(new Set(ready.map((f) => f.id)));
    setRows((prev) => prev.filter((r) => !ready.some((f) => f.id === r.id)));

    const payload = {
      images: ready.map((f) => ({
        id: f.id,
        fileName: f.name,
        previewUrl: f.previewUrl!,
        description: f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
        mimeType: f.type || 'image/jpeg',
      })),
      settings: {
        titleLength: settings.titleLength,
        descriptionLength: settings.descriptionLength,
        includeDescription: effectiveIncludeDescription,
        keywordsCount: settings.keywordsCount,
        prefix: prefixEnabled ? prefixText : '',
        suffix: suffixEnabled ? suffixText : '',
        negativeTitleWords: negWordsEnabled ? negWords : [],
        negativeKeywords: negKwsEnabled ? negKws : [],
      },
      platform: selectedPlatform,
    };

    // Finish path for a user-stopped run (same state + toast as the old
    // abort path).
    const finishStopped = () => {
      setIsGenerating(false);
      setGeneratingIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      const doneCount = completedCountRef.current;
      if (doneCount > 0) {
        toast({
          title: `Stopped: ${doneCount} completed`,
          description: unlimited
            ? 'Generation stopped.'
            : 'Generation stopped. Credits for unprocessed files will be refunded automatically.',
          variant: 'warning',
        });
      } else {
        toast({
          title: 'Generation stopped',
          description: unlimited
            ? 'Generation stopped.'
            : 'Credits for unprocessed files will be refunded automatically.',
          variant: 'warning',
        });
      }
    };

    // Finish path for a completed job — same state + toasts as the old
    // SSE 'done' handler.
    const finishDone = (succeeded: number, failed: number, refundError?: string) => {
      setIsGenerating(false);
      setGeneratingIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      // T2-08: the success modal is a celebration (stats + share links) —
      // it used to open even when EVERY image failed. Only open it when
      // at least one image actually succeeded; an all-failed run gets
      // the failure toast below instead.
      if (succeeded > 0) {
        setSuccessModalOpen(true);
      }

      if (refundError) {
        // The job reported a refund that was attempted but failed —
        // never claim the credits came back automatically (CQ-03).
        toast({
          title: 'Refund issue',
          description:
            'Some credits could not be refunded automatically — please contact support.',
          variant: 'warning',
        });
      } else if (succeeded === 0) {
        toast({
          title: `All ${failed} image${failed === 1 ? '' : 's'} failed`,
          description: unlimited
            ? 'Nothing was generated. Please try again.'
            : 'Nothing was generated — credits refunded automatically.',
          variant: 'error',
        });
      } else if (failed > 0) {
        toast({
          title: `${succeeded}/${succeeded + failed} generated`,
          description: unlimited
            ? `${failed} failed.`
            : `${failed} failed — credits refunded automatically.`,
          variant: 'warning',
        });
      } else {
        toast({
          title: `Generated ${succeeded} metadata entries`,
          variant: 'success',
        });
      }
    };

    try {
      const res = await fetch('/api/generate/batch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Generation failed');
      }

      const { jobId } = await res.json();
      if (!jobId) throw new Error('Generation failed');

      // Poll the job row every 2.5s — SSE events never reached browsers
      // through the production proxy stack (jobs completed server-side
      // while the UI spun forever); plain GET polling works everywhere.
      // R9 H3: `knownFinished` is sent as ?known= — while the job's
      // finished-entry count is unchanged, the server answers with a
      // compact payload (status + counts, no results array), and the
      // mapping below is skipped for that poll.
      let consecutivePollErrors = 0;
      let knownFinished = 0;
      while (true) {
        if (stopRequestedRef.current) {
          finishStopped();
          return;
        }

        let data: any;
        try {
          const pollRes = await fetch(`/api/generate/jobs/${jobId}?known=${knownFinished}`);
          if (!pollRes.ok) throw new Error('poll_failed');
          data = await pollRes.json();
          consecutivePollErrors = 0;
        } catch {
          consecutivePollErrors += 1;
          if (consecutivePollErrors > 5) throw new Error('Generation failed');
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        const results: any[] =
          data.unchanged === true || !Array.isArray(data.results) ? [] : data.results;
        let finishedCount = 0;
        for (const result of results) {
          if (result.status !== 'complete' && result.status !== 'failed') continue;
          finishedCount += 1;
          const mapped: GeneratedRow = {
            id: result.id,
            fileName: result.fileName,
            title: result.title || '',
            description: result.description || '',
            keywords: Array.isArray(result.keywords) ? result.keywords : [],
            altText: result.altText || '',
            provider: result.provider || '',
            model: result.model || '',
            tokensUsed: result.tokensUsed || 0,
            status: result.status || 'complete',
            error: result.error,
            platform: result.platform || selectedPlatform,
          };

          setRows((prev) => {
            const existing = prev.find((r) => r.id === result.id);
            if (existing) {
              return prev.map((r) => (r.id === result.id ? mapped : r));
            }
            return [...prev, mapped];
          });

          setGeneratingIds((prev) => {
            const next = new Set(prev);
            next.delete(result.id);
            return next;
          });
        }
        // On a compact (unchanged) poll there were no results to map:
        // the finished count is by definition the one we reported.
        if (data.unchanged === true) finishedCount = knownFinished;
        else knownFinished = finishedCount;
        completedCountRef.current = finishedCount;

        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          // A FAILED job with zero finished images means the runner died
          // before any group landed — surface it as an error, not a
          // "Generated 0 entries" success.
          if (data.status === 'FAILED' && data.succeeded === 0 && data.failed === 0) {
            throw new Error(data.errorMessage || 'Generation failed');
          }
          finishDone(data.succeeded ?? 0, data.failed ?? 0, data.refundError);
          return;
        }

        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (error: any) {
      setIsGenerating(false);
      setGeneratingIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      // API key required → show the add-key popup instead of a generic toast.
      // The backend returns {"error":"user_api_key_required",...} as a raw
      // JSON string in the error response body.
      const needsApiKey = isApiKeyError(error.message);
      if (needsApiKey) {
        setApiKeyDialogOpen(true);
      } else {
        toast({
          title: 'Generation failed',
          description: error.message || 'Unknown error',
          variant: 'error',
        });
      }
    }
  }

  function stopGeneration() {
    // Stops the UI polling only — the server-side job keeps running to
    // completion, and failed/unprocessed images are refunded there, so
    // the refund wording in the stopped toast stays accurate.
    stopRequestedRef.current = true;
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: string, field: string, value: string | string[]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function regenerateSingle(rowId: string) {
    const f = files.find((file) => file.id === rowId);
    if (!f || !f.previewUrl) return;
    if (!unlimited && credits < 1) {
      toast({ title: 'Insufficient credits', description: 'You need at least 1 credit to regenerate.', variant: 'error' });
      return;
    }

    setGeneratingIds((prev) => new Set(prev).add(rowId));

    const payload = {
      images: [
        {
          id: f.id,
          fileName: f.name,
          previewUrl: f.previewUrl,
          description: f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          mimeType: f.type || 'image/jpeg',
        },
      ],
      settings: {
        titleLength: settings.titleLength,
        descriptionLength: settings.descriptionLength,
        includeDescription: effectiveIncludeDescription,
        keywordsCount: settings.keywordsCount,
        prefix: prefixEnabled ? prefixText : '',
        suffix: suffixEnabled ? suffixText : '',
        negativeTitleWords: negWordsEnabled ? negWords : [],
        negativeKeywords: negKwsEnabled ? negKws : [],
      },
      platform: selectedPlatform,
    };

    try {
      const res = await fetch('/api/generate/batch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Regeneration failed');
      const { jobId } = await res.json();
      if (!jobId) throw new Error('Regeneration failed');

      // Poll the job until the single result lands (SSE delivery proved
      // unreliable through the production proxy stack).
      // R9 H3: ?known= compact polls — while no entry has finished
      // since the last full payload, the server omits the results
      // array and the target entry cannot have landed yet.
      let consecutivePollErrors = 0;
      let knownFinished = 0;
      while (true) {
        let data: any;
        try {
          const pollRes = await fetch(`/api/generate/jobs/${jobId}?known=${knownFinished}`);
          if (!pollRes.ok) throw new Error('poll_failed');
          data = await pollRes.json();
          consecutivePollErrors = 0;
        } catch {
          consecutivePollErrors += 1;
          if (consecutivePollErrors > 5) throw new Error('Regeneration failed');
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        const pollResults: any[] =
          data.unchanged === true || !Array.isArray(data.results) ? [] : data.results;
        if (data.unchanged !== true) {
          knownFinished = pollResults.filter(
            (r: any) => r.status === 'complete' || r.status === 'failed',
          ).length;
        }
        const result = pollResults.find(
          (r: any) => r.id === rowId && (r.status === 'complete' || r.status === 'failed'),
        );

        if (result) {
          const mapped: GeneratedRow = {
            id: result.id,
            fileName: result.fileName,
            title: result.title || '',
            description: result.description || '',
            keywords: Array.isArray(result.keywords) ? result.keywords : [],
            altText: result.altText || '',
            provider: result.provider || '',
            model: result.model || '',
            tokensUsed: result.tokensUsed || 0,
            status: result.status || 'complete',
            error: result.error,
            platform: result.platform || selectedPlatform,
          };

          setRows((prev) => prev.map((r) => (r.id === result.id ? mapped : r)));
          if (result.status === 'complete') {
            toast({ title: 'Regenerated successfully', variant: 'success' });
          } else {
            toast({
              title: 'Regeneration failed',
              description: data.refundError
                ? 'Some credits could not be refunded automatically — please contact support.'
                : result.error || 'Generation failed',
              variant: 'error',
            });
          }
          return;
        }

        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          throw new Error(data.errorMessage || 'Regeneration failed');
        }

        await new Promise((r) => setTimeout(r, 2500));
      }
    } catch (e: any) {
      toast({ title: 'Regeneration failed', description: e.message, variant: 'error' });
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }

  function addTag(list: 'negWords' | 'negKws', value: string) {
    const v = value.trim();
    if (!v) return;
    if (list === 'negWords') setNegWords((prev) => [...prev, v]);
    else setNegKws((prev) => [...prev, v]);
  }

  function removeTag(list: 'negWords' | 'negKws', idx: number) {
    if (list === 'negWords') setNegWords((prev) => prev.filter((_, i) => i !== idx));
    else setNegKws((prev) => prev.filter((_, i) => i !== idx));
  }

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payloadRows = rows.map((r) => ({
        fileName: r.fileName,
        title: r.title,
        description: r.description,
        keywords: r.keywords,
      }));
      const res = await fetch('/api/generate/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: payloadRows,
          format: exportFormat,
          category: exportCategory,
          releases: exportReleases,
          sendEmail,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'export_failed');
      }
      const emailDelivery = res.headers.get('x-email-delivery');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = csvFilename(exportFormat);
      a.click();
      URL.revokeObjectURL(url);
      return { emailDelivery };
    },
    // T2-04: when the user asked for an emailed copy, say plainly what
    // happened — the CSV always downloads here; the email only counts
    // when the server confirms it was actually sent.
    onSuccess: (data) => {
      if (sendEmail && data?.emailDelivery !== 'sent') {
        toast({
          title: `Exported ${PLATFORMS[exportFormat].label} CSV`,
          description:
            'Downloaded to this device. Email delivery is not available right now, so no copy was emailed.',
          variant: 'warning',
        });
      } else if (sendEmail) {
        toast({
          title: `Exported ${PLATFORMS[exportFormat].label} CSV`,
          description: `Downloaded — a copy was also emailed to ${user.email}.`,
          variant: 'success',
        });
      } else {
        toast({ title: `Exported ${PLATFORMS[exportFormat].label} CSV`, variant: 'success' });
      }
    },
    onError: (e: any) =>
      toast({ title: 'Export failed', description: e.message, variant: 'error' }),
  });

  const readyCount = files.filter((f) => f.status === 'done').length;
  const hasResults = rows.length > 0;
  const completedRows = rows.filter((r) => r.status === 'complete');
  const failedRows = rows.filter((r) => r.status === 'failed');
  const canGenerate = readyCount > 0 && !isGenerating && (unlimited || credits >= readyCount);
  const currentPlatformConfig = PLATFORMS[selectedPlatform];

  // Total file sizes
  const totalFileSize = React.useMemo(() => {
    const bytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [files]);

  // Generation progress tracking
  const genTotal = React.useMemo(() => {
    if (!isGenerating) return 0;
    return runTotal;
  }, [isGenerating, runTotal]);
  const genDone = rows.length;
  const genSucceeded = completedRows.length;
  const genFailed = failedRows.length;
  const genProgress = genTotal > 0 ? Math.round((genDone / genTotal) * 100) : 0;

  // Upload progress — the same bar also tracks files settling (upload /
  // analyze) before generation starts, so it animates with a % during
  // upload instead of sitting dead at 0.
  const settledCount = files.filter((f) => f.status === 'done' || f.status === 'error').length;
  const failedFileCount = files.filter((f) => f.status === 'error').length;
  const isUploading = files.some((f) => f.status === 'queued' || f.status === 'analyzing');
  const uploadPct = files.length ? Math.round((settledCount / files.length) * 100) : 0;
  const barPct = isGenerating ? genProgress : isUploading ? uploadPct : 100;

  // ETA computation
  const etaLabel = React.useMemo(() => {
    if (!isGenerating || completedCountRef.current < 2 || genStartRef.current === 0) return '';
    const elapsed = (Date.now() - genStartRef.current) / 1000;
    const avgPerFile = elapsed / completedCountRef.current;
    const remaining = genTotal - genDone;
    if (remaining <= 0) return '';
    const etaSec = Math.round(avgPerFile * remaining);
    return `~${etaSec}s`;
  }, [isGenerating, genTotal, genDone]);

  // Presentational lookup: result rows echo back the uploaded file id, so we
  // can show the source thumbnail + original file size without any API change.
  const fileById = React.useMemo(
    () => new Map(files.map((f) => [f.id, f] as const)),
    [files],
  );

  const displayedItems = React.useMemo(() => {
    const items: Array<
      | { type: 'generating'; file: UploadedFile }
      | { type: 'row'; row: GeneratedRow; file?: UploadedFile }
    > = [];
    const handledIds = new Set<string>();

    for (const f of files) {
      const row = rows.find((r) => r.id === f.id);
      if (row) {
        items.push({ type: 'row', row, file: f });
        handledIds.add(f.id);
      } else if (generatingIds.has(f.id)) {
        items.push({ type: 'generating', file: f });
        handledIds.add(f.id);
      }
    }

    for (const r of rows) {
      if (!handledIds.has(r.id)) {
        items.push({ type: 'row', row: r, file: fileById.get(r.id) });
      }
    }

    return items;
  }, [files, rows, generatingIds, fileById]);

  // Action bar — handed to ImageUploader's actionBar slot so the
  // buttons sit directly under the upload box, above the file list,
  // instead of in a separate card below the (potentially long) list.
  const actionBar = files.length > 0 ? (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* Left block: status + progress */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[11px] text-muted-foreground leading-snug truncate">
              {isGenerating ? (
                <>
                  Processing: {genDone}/{genTotal} | Success: {genSucceeded}, Failed: {genFailed}
                  {etaLabel && <> | ETA: {etaLabel}</>}
                </>
              ) : isUploading ? (
                <>
                  Uploading: {settledCount}/{files.length} | Ready: {readyCount}
                  {failedFileCount > 0 && <>, Failed: {failedFileCount}</>}
                </>
              ) : (
                <>
                  {readyCount} file{readyCount === 1 ? '' : 's'} ready for metadata | Single: 1 file per request | Total: {totalFileSize}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 flex-1 rounded-full bg-border/60 overflow-hidden"
                role="progressbar"
                aria-valuenow={barPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
                {barPct}%
              </span>
            </div>
          </div>

          {/* Right block: buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isGenerating ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9 rounded-lg text-[13px]"
                  onClick={stopGeneration}
                >
                  <StopCircle className="h-4 w-4" />
                  Stop
                </Button>
                <Button
                  size="sm"
                  className="h-9 rounded-lg text-[13px]"
                  disabled
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9 rounded-lg text-[13px]"
                  onClick={() => {
                    setFiles([]);
                    setRows([]);
                    setShowExportPanel(false);
                    setDropzoneExpanded(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </Button>
                <Button
                  size="sm"
                  className="h-9 rounded-lg text-[13px]"
                  onClick={() => startStreamingGeneration()}
                  disabled={!canGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate All ({readyCount})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg text-[13px]"
                  disabled={completedRows.length === 0}
                  onClick={() => setShowExportPanel((v) => !v)}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Credit warning */}
        {!isGenerating && readyCount > 0 && !unlimited && credits < readyCount && (
          <p className="mt-2 text-[11px] text-amber-400">
            You need {readyCount} credits but have {credits}.
          </p>
        )}
      </CardContent>
    </Card>
  ) : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
      {/* Left: Control Rail */}
      <ControlsRail
        activeTab={activeTab || 'metadata'}
        onTabChange={onTabChange || (() => {})}
        selectedPlatform={selectedPlatform}
        handlePlatformChange={handlePlatformChange}
        settings={settings}
        setSettings={setSettings}
        persistSettings={persistSettings}
        currentPlatformConfig={currentPlatformConfig}
        includeDescription={effectiveIncludeDescription}
        setIncludeDescription={setIncludeDescription}
        prefixEnabled={prefixEnabled}
        setPrefixEnabled={setPrefixEnabled}
        prefixText={prefixText}
        setPrefixText={setPrefixText}
        suffixEnabled={suffixEnabled}
        setSuffixEnabled={setSuffixEnabled}
        suffixText={suffixText}
        setSuffixText={setSuffixText}
        negWordsEnabled={negWordsEnabled}
        setNegWordsEnabled={setNegWordsEnabled}
        negWords={negWords}
        negKwsEnabled={negKwsEnabled}
        setNegKwsEnabled={setNegKwsEnabled}
        negKws={negKws}
        addTag={addTag}
        removeTag={removeTag}
        user={user}
      />

      {/* Right: Workspace */}
      <div className="space-y-4">
          {/* ═══ A) Upload Card ═══ */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                    <Upload className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <CardTitle className="text-sm">Upload Files</CardTitle>
                  {files.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {readyCount}/{files.length} ready
                    </Badge>
                  )}
                </div>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDropzoneExpanded((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {dropzoneExpanded ? 'Collapse' : 'Expand'}
                    {dropzoneExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {(dropzoneExpanded || files.length === 0) && (
                <ImageUploader
                  files={files}
                  onFilesChange={setFiles}
                  batchLimit={batchLimit}
                  disabled={isGenerating}
                  actionBar={actionBar}
                />
              )}
            </CardContent>
          </Card>

          {/* Results table (editable before export) */}
          {files.length > 0 && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm">Generated Metadata</CardTitle>
                  <CardDescription className="text-[11px]">
                    {hasResults
                      ? `${rows.length} image(s) processed for ${currentPlatformConfig.label}. Edit any field before exporting.`
                      : 'Generated metadata will appear here.'}
                  </CardDescription>
                </div>
                {hasResults && (
                  <div className="flex shrink-0 gap-1.5">
                    {/* T2-06: this button used to also read "Clear All"
                        and silently wiped the uploaded files too — two
                        same-named buttons with different scopes. It now
                        clears ONLY the generated results (files stay, so
                        the batch can be re-run); the action bar's
                        "Clear All" remains the full files+results reset. */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setRows([]);
                        setShowExportPanel(false);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear Results
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            rows
                              .filter((r) => r.status === 'complete')
                              .map((r) => `${r.fileName}\t${r.title}`)
                              .join('\n'),
                          );
                          toast({ title: 'Copied titles to clipboard', variant: 'success' });
                        } catch {
                          toast({ title: 'Copy failed', description: 'Clipboard access was denied.', variant: 'error' });
                        }
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      Copy Titles
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setShowExportPanel((v) => !v)}
                    >
                      <Download className="h-3 w-3" />
                      Export CSV
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {showExportPanel && hasResults && (
                <div className="space-y-2.5 rounded-lg border border-border bg-card-2 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-foreground">
                      Agency CSV Export Config
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {PLATFORMS[exportFormat].label} Format
                    </Badge>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Stock Agency Format
                    </label>
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                      className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="adobe">Adobe Stock CSV (50 Custom Attributes + Category)</option>
                      <option value="shutterstock">Shutterstock CSV (Full Sentence Media File Format)</option>
                      <option value="freepik">Freepik CSV (Filename, Title, Keywords, Category)</option>
                      <option value="vecteezy">Vecteezy CSV (Filename, Title, Desc, Keywords, License)</option>
                      <option value="istock">iStock / Getty CSV (Clean Conceptual Format)</option>
                      <option value="generic">Universal / Standard Microstock CSV</option>
                    </select>
                  </div>

                  {(exportFormat === 'adobe' || exportFormat === 'shutterstock' || exportFormat === 'freepik' || exportFormat === 'generic') && (
                    <div>
                      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Category (Optional)
                      </label>
                      <Input
                        value={exportCategory}
                        onChange={(e) => setExportCategory(e.target.value)}
                        placeholder="e.g. Technology, Nature, Business, Graphic Resources"
                        className="mt-1"
                      />
                    </div>
                  )}

                  {(exportFormat === 'adobe' || exportFormat === 'shutterstock') && (
                    <div>
                      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Model / Property Releases (Optional)
                      </label>
                      <Input
                        value={exportReleases}
                        onChange={(e) => setExportReleases(e.target.value)}
                        placeholder="e.g. Yes, No, or Release Document Name"
                        className="mt-1"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <Toggle
                      label="Email CSV copy to me"
                      checked={sendEmail}
                      onChange={setSendEmail}
                    />
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                  >
                    {exportMutation.isPending ? (
                      <Upload className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download {PLATFORMS[exportFormat].shortLabel} CSV
                  </Button>
                </div>
              )}

                            {displayedItems.length === 0 ? (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Layers className="h-8 w-8 text-muted-foreground/50" />
                  <span>No metadata generated yet. Upload images above to get started.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedItems.map((item) => {
                    const file = item.file || (item.type === "row" ? fileById.get(item.row.id) : undefined);
                    const row = item.type === "row" ? item.row : rows.find((r) => r.id === item.file.id);
                    const isRowGenerating = item.type === "generating" || (file ? generatingIds.has(file.id) : false) || (row ? generatingIds.has(row.id) : false);
                    const cardId = file?.id || row?.id || Math.random().toString();

                    return (
                      <ResultCard
                        key={`result-${cardId}`}
                        file={file}
                        row={row}
                        isGenerating={isRowGenerating}
                        includeDescription={effectiveIncludeDescription}
                        currentPlatformConfig={currentPlatformConfig}
                        onUpdateRow={updateRow}
                        onRemove={removeFile}
                        onRegenerate={regenerateSingle}
                        onCopyTitle={async (title, id) => {
                          try {
                            await navigator.clipboard.writeText(title);
                            setCopiedId(`title-${id}`);
                            setTimeout(() => setCopiedId(null), 1500);
                          } catch {
                            toast({ title: 'Copy failed', variant: 'error' });
                          }
                        }}
                        onCopyKeywords={async (keywords, id) => {
                          try {
                            await navigator.clipboard.writeText(keywords.join(", "));
                            setCopiedId(`kw-${id}`);
                            setTimeout(() => setCopiedId(null), 1500);
                          } catch {
                            toast({ title: 'Copy failed', variant: 'error' });
                          }
                        }}
                        copiedId={copiedId}
                      />
                    );
                  })}
                </div>
              )}
                        </CardContent>
          </Card>
          )}
        </div>

      {/* Success Modal */}

      {/* Success Modal */}
      <MetadataSuccessModal
        open={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        rows={rows}
        platform={selectedPlatform}
        exportFormat={exportFormat}
        isExporting={exportMutation.isPending}
        onExport={() => {
          exportMutation.mutate();
          setSuccessModalOpen(false);
        }}
      />
      <ApiKeyRequiredDialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen} />
    </div>
  );
}


