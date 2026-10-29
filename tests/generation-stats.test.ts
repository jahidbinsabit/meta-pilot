import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TIME_ZONE,
  countJobImages,
  dayKeyInTimeZone,
  startOfDayInTimeZone,
} from '@/lib/generation-stats';

describe('startOfDayInTimeZone (Asia/Dhaka, UTC+6, no DST)', () => {
  it('just after Dhaka midnight maps to 18:00Z the previous UTC day', () => {
    // 2026-10-29T18:37Z is 2026-10-30 00:37 in Dhaka.
    const start = startOfDayInTimeZone(BUSINESS_TIME_ZONE, new Date('2026-10-29T18:37:00Z'));
    expect(start.toISOString()).toBe('2026-10-29T18:00:00.000Z');
  });

  it('Dhaka daytime maps to 18:00Z the previous UTC day as well', () => {
    // 2026-10-29T10:00Z is 16:00 in Dhaka on Oct 29.
    const start = startOfDayInTimeZone(BUSINESS_TIME_ZONE, new Date('2026-10-29T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-28T18:00:00.000Z');
  });

  it('an instant exactly at Dhaka midnight starts a new day', () => {
    const start = startOfDayInTimeZone(BUSINESS_TIME_ZONE, new Date('2026-10-29T18:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-29T18:00:00.000Z');
  });
});

describe('dayKeyInTimeZone', () => {
  it('rolls to the next Dhaka day at 18:00Z', () => {
    expect(dayKeyInTimeZone(BUSINESS_TIME_ZONE, new Date('2026-10-29T17:59:00Z'))).toBe('2026-10-29');
    expect(dayKeyInTimeZone(BUSINESS_TIME_ZONE, new Date('2026-10-29T18:00:00Z'))).toBe('2026-10-30');
  });
});

describe('countJobImages', () => {
  it('counts only completed results in a generator batch', () => {
    const job = {
      toolSlug: 'metadata-generator',
      status: 'COMPLETE',
      outputData: {
        results: [{ status: 'complete' }, { status: 'complete' }, { status: 'failed' }, { status: 'processing' }],
      },
      inputFileUrls: ['a', 'b', 'c', 'd'],
    };
    expect(countJobImages(job)).toBe(2);
  });

  it('counts image-prompt jobs the same way', () => {
    const job = {
      toolSlug: 'image-to-prompt',
      status: 'PROCESSING',
      outputData: { results: [{ status: 'complete' }, { status: 'processing' }] },
      inputFileUrls: ['a', 'b'],
    };
    expect(countJobImages(job)).toBe(1);
  });

  it('falls back to the input count for a COMPLETE generator job without results', () => {
    const job = {
      toolSlug: 'metadata-generator',
      status: 'COMPLETE',
      outputData: { platform: 'adobe' },
      inputFileUrls: ['a', 'b', 'c'],
    };
    expect(countJobImages(job)).toBe(3);
  });

  it('counts nothing for an unfinished generator job without results', () => {
    expect(
      countJobImages({ toolSlug: 'metadata-generator', status: 'PROCESSING', outputData: {}, inputFileUrls: ['a'] }),
    ).toBe(0);
  });

  it('counts a completed single-output tool job as 1, a failed one as 0', () => {
    expect(countJobImages({ toolSlug: 'bg-remover', status: 'COMPLETE', outputData: {}, inputFileUrls: [] })).toBe(1);
    expect(countJobImages({ toolSlug: 'bg-remover', status: 'FAILED', outputData: {}, inputFileUrls: [] })).toBe(0);
  });

  it('survives null outputData', () => {
    expect(countJobImages({ toolSlug: 'metadata-generator', status: 'FAILED', outputData: null, inputFileUrls: [] })).toBe(0);
  });
});
