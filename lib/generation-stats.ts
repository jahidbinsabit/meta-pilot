/**
 * Generation counting for admin stats.
 *
 * Two decisions live here, both made with the owner (Oct 2026):
 *  - A "generation" is an IMAGE produced, not a job row: one batch job
 *    can carry 100 images, so counting ToolJob rows understated real
 *    usage by ~70x (the overview showed 11 for a 150+ image day).
 *  - "Today" is the owner's business day — Asia/Dhaka — not the UTC
 *    day. Dhaka has no DST, so day arithmetic on 24h steps is exact.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Dhaka';

const GENERATOR_SLUGS = new Set(['metadata-generator', 'image-to-prompt']);

interface CountableJob {
  toolSlug: string;
  status: string;
  outputData?: unknown;
  inputFileUrls?: unknown;
}

/**
 * How many images one job actually produced. Generator jobs count their
 * completed per-image results (the same `status === 'complete'` marker
 * the runners themselves use for success counts); a COMPLETE generator
 * job whose results array is missing falls back to its input count.
 * Any other tool job produces a single output, counted when COMPLETE.
 */
export function countJobImages(job: CountableJob): number {
  const out =
    job.outputData && typeof job.outputData === 'object'
      ? (job.outputData as Record<string, unknown>)
      : null;

  if (GENERATOR_SLUGS.has(job.toolSlug)) {
    const results = out?.results;
    if (Array.isArray(results)) {
      return results.filter(
        (r) => r && typeof r === 'object' && (r as { status?: unknown }).status === 'complete',
      ).length;
    }
    if (job.status === 'COMPLETE') {
      if (Array.isArray(job.inputFileUrls)) return job.inputFileUrls.length;
      const images = out?.images;
      if (Array.isArray(images)) return images.length;
    }
    return 0;
  }

  return job.status === 'COMPLETE' ? 1 : 0;
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
export function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant the current calendar day starts in `timeZone`. */
export function startOfDayInTimeZone(timeZone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const utcMidnight = Date.UTC(get('year'), get('month') - 1, get('day'));
  return new Date(utcMidnight - timeZoneOffsetMs(timeZone, new Date(utcMidnight)));
}

/** 'YYYY-MM-DD' calendar key of an instant in `timeZone`. */
export function dayKeyInTimeZone(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => String(parts.find((p) => p.type === type)?.value ?? '').padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}`;
}
