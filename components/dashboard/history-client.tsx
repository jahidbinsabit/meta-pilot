'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Image as ImageIcon,
  ChevronDown,
  Download,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildCsv, csvFilename, type CsvRow, type ExportFormat } from '@/lib/generator/csv';

interface JobSummary {
  id: string;
  tool: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  /** Platform the batch was generated for; null on legacy jobs. */
  platform: ExportFormat | null;
  /** True once the cron's 90-day payload retention stripped the results. */
  resultsExpired: boolean;
  totals: { total: number; succeeded: number; failed: number; refunded: number };
}

interface JobsResponse {
  jobs: JobSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface JobDetail {
  loading: boolean;
  results: any[] | null;
  error: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  'metadata-generator': 'Metadata',
  'image-to-prompt': 'Image to Prompt',
};

function toolLabel(slug: string): string {
  return (
    TOOL_LABELS[slug] ||
    slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

function statusBadge(status: JobSummary['status']): {
  variant: 'success' | 'warning' | 'info' | 'muted';
  label: string;
} {
  switch (status) {
    case 'COMPLETE':
      return { variant: 'success', label: 'Completed' };
    case 'FAILED':
      return { variant: 'warning', label: 'Failed' };
    case 'PROCESSING':
      return { variant: 'info', label: 'Processing' };
    default:
      return { variant: 'muted', label: 'Queued' };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ToolFilter = 'all' | 'metadata-generator' | 'image-to-prompt';
type StatusFilter = 'all' | JobSummary['status'];

export function HistoryClient() {
  const [jobs, setJobs] = React.useState<JobSummary[] | null>(null);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, JobDetail>>({});
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  // T2-12: tool/status filters — applied server-side (the jobs route
  // accepts ?tool= / ?status=), so pagination stays truthful.
  const [toolFilter, setToolFilter] = React.useState<ToolFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const filtersActive = toolFilter !== 'all' || statusFilter !== 'all';

  const loadPage = React.useCallback(
    async (p: number) => {
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (toolFilter !== 'all') params.set('tool', toolFilter);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await fetch(`/api/generate/jobs?${params.toString()}`);
        if (!res.ok) throw new Error('load_failed');
        const data = (await res.json()) as JobsResponse;
        setJobs(data.jobs);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setLoadError(null);
      } catch {
        setLoadError('Could not load your generation history.');
      }
    },
    [toolFilter, statusFilter],
  );

  React.useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  // While any visible job is still running, quietly refresh the page so
  // statuses settle without a manual reload.
  const hasActive = (jobs ?? []).some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
  React.useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void loadPage(page), 5000);
    return () => clearInterval(t);
  }, [hasActive, page, loadPage]);

  const ensureDetail = React.useCallback(
    async (jobId: string): Promise<any[] | null> => {
      const cached = details[jobId];
      if (cached?.results) return cached.results;
      setDetails((prev) => ({
        ...prev,
        [jobId]: { loading: true, results: prev[jobId]?.results ?? null, error: null },
      }));
      try {
        const res = await fetch(`/api/generate/jobs/${jobId}`);
        if (!res.ok) throw new Error('detail_failed');
        const data = await res.json();
        const results: any[] = Array.isArray(data.results) ? data.results : [];
        setDetails((prev) => ({ ...prev, [jobId]: { loading: false, results, error: null } }));
        return results;
      } catch {
        setDetails((prev) => ({
          ...prev,
          [jobId]: { loading: false, results: null, error: 'Could not load this batch.' },
        }));
        return null;
      }
    },
    [details],
  );

  const toggleExpand = (job: JobSummary) => {
    if (expandedId === job.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(job.id);
    void ensureDetail(job.id);
  };

  const downloadJob = async (job: JobSummary) => {
    setDownloadingId(job.id);
    try {
      const results = await ensureDetail(job.id);
      if (!results) return;
      const complete = results.filter((r) => r.status === 'complete');
      if (job.tool === 'metadata-generator') {
        // Re-export in the job's OWN platform format (R7-F4) — the same
        // buildCsv the generator's export flow uses, so a CSV recovered
        // from History maps in the platform's importer exactly like the
        // original in-session export (incl. NO Description column for
        // Adobe). Stored results carry no export-time category/releases,
        // so those columns stay empty, same as an export without them.
        const format: ExportFormat = job.platform ?? 'generic';
        const rows: CsvRow[] = complete.map((r) => ({
          fileName: String(r.fileName || ''),
          title: String(r.title || ''),
          description: String(r.description || ''),
          keywords: Array.isArray(r.keywords) ? r.keywords.map((k: any) => String(k)) : [],
          category: typeof r.category === 'string' ? r.category : undefined,
          releases: typeof r.releases === 'string' ? r.releases : undefined,
        }));
        downloadText(csvFilename(format), buildCsv(format, rows), 'text/csv');
      } else if (job.tool === 'image-to-prompt') {
        const blocks = complete.map((r) => {
          const lines = [String(r.fileName || ''), String(r.prompt || '')];
          if (r.negativePrompt) lines.push(`Negative prompt: ${r.negativePrompt}`);
          return lines.join('\n');
        });
        downloadText(`prompts-${job.id.slice(0, 8)}.txt`, blocks.join('\n\n'), 'text/plain');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={toolFilter}
        onChange={(e) => setToolFilter(e.target.value as ToolFilter)}
        aria-label="Filter by tool"
        className="rounded-lg border border-input bg-background/60 px-2 py-1.5 text-xs"
      >
        <option value="all">All tools</option>
        <option value="metadata-generator">Metadata</option>
        <option value="image-to-prompt">Image to Prompt</option>
      </select>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        aria-label="Filter by status"
        className="rounded-lg border border-input bg-background/60 px-2 py-1.5 text-xs"
      >
        <option value="all">All statuses</option>
        <option value="COMPLETE">Completed</option>
        <option value="FAILED">Failed</option>
        <option value="PROCESSING">Processing</option>
        <option value="QUEUED">Queued</option>
      </select>
      {filtersActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setToolFilter('all');
            setStatusFilter('all');
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );

  if (jobs === null && !loadError) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading history…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <h3 className="mt-4 font-semibold">Something went wrong</h3>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        <Button size="sm" className="mt-4" onClick={() => void loadPage(page)}>
          Try again
        </Button>
      </div>
    );
  }

  if (jobs && jobs.length === 0 && total === 0) {
    // A filtered view with no matches is NOT the first-run state —
    // keep the filters visible and say what happened (T2-12).
    if (filtersActive) {
      return (
        <div className="space-y-4">
          {filterBar}
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
            <h3 className="font-semibold">No batches match these filters</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different tool or status — or clear the filters to see everything.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Sparkles className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-semibold">No generations yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No generations yet — your completed batches will appear here.
        </p>
        <Link href="/dashboard/generate" className="mt-4">
          <Button size="sm" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Generate Now
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterBar}
      <div className="space-y-2">
        {(jobs ?? []).map((job) => {
          const badge = statusBadge(job.status);
          const Icon = job.tool === 'image-to-prompt' ? ImageIcon : Sparkles;
          const expanded = expandedId === job.id;
          const detail = details[job.id];
          const downloadable =
            job.status === 'COMPLETE' &&
            !job.resultsExpired &&
            (job.tool === 'metadata-generator' || job.tool === 'image-to-prompt');
          return (
            <Card key={job.id}>
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {toolLabel(job.tool)} · {job.totals.total}{' '}
                      {job.totals.total === 1 ? 'image' : 'images'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(job.createdAt)}
                      <span> &middot; </span>
                      {job.totals.succeeded} succeeded
                      {job.totals.failed > 0 && (
                        <>
                          <span> &middot; </span>
                          {job.totals.failed} failed
                        </>
                      )}
                      {job.totals.refunded > 0 && (
                        <>
                          <span> &middot; </span>
                          {job.totals.refunded} credits refunded
                        </>
                      )}
                    </p>
                  </div>
                  <Badge variant={badge.variant} className="shrink-0">
                    {badge.label}
                  </Badge>
                  {downloadable && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={downloadingId === job.id}
                      onClick={() => void downloadJob(job)}
                    >
                      {downloadingId === job.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {job.tool === 'metadata-generator' ? 'CSV' : 'TXT'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={() => toggleExpand(job)}
                    aria-expanded={expanded}
                  >
                    {expanded ? 'Hide' : 'View'}
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                    />
                  </Button>
                </div>

                {expanded && (
                  <div className="border-t border-border px-4 py-3">
                    {!detail || detail.loading ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading results…
                      </div>
                    ) : detail.error ? (
                      <p className="py-3 text-sm text-amber-400">{detail.error}</p>
                    ) : detail.results && detail.results.length > 0 ? (
                      <div className="space-y-3">
                        {detail.results.map((r: any) => (
                          <div
                            key={r.id || r.fileName}
                            className="rounded-lg border border-border/60 bg-card/30 p-3"
                          >
                            <p className="truncate text-sm font-medium">
                              {r.fileName || 'Untitled'}
                            </p>
                            {r.status !== 'complete' ? (
                              <p className="mt-1 text-xs text-amber-400">
                                {r.status === 'processing' ? 'Still processing…' : 'Failed'}
                              </p>
                            ) : job.tool === 'image-to-prompt' ? (
                              <>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                  {r.prompt}
                                </p>
                                {r.negativePrompt && (
                                  <p className="mt-1 text-xs text-muted-foreground/70">
                                    Negative prompt: {r.negativePrompt}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                {r.title && (
                                  <p className="mt-1 text-sm text-foreground">{r.title}</p>
                                )}
                                {r.description && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {r.description}
                                  </p>
                                )}
                                {Array.isArray(r.keywords) && r.keywords.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {r.keywords.map((k: string) => (
                                      <span
                                        key={k}
                                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                      >
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : job.resultsExpired ? (
                      <p className="py-3 text-sm text-muted-foreground">
                        Results expired — full results are kept for 90 days. This batch&apos;s
                        counts above are still accurate, but its per-image results and downloads
                        are no longer available.
                      </p>
                    ) : (
                      <p className="py-3 text-sm text-muted-foreground">No results stored for this batch.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} batches
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => void loadPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => void loadPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
