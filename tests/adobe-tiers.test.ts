import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeLimit,
  applyRowGate,
  resolveDailyCap,
  envDailySearchCap,
  FREE_TIER_RESULT_LIMIT,
  DEFAULT_DAILY_SEARCH_CAP,
} from '@/lib/adobe-analytics/tiers';

describe('normalizeLimit (R9 N3 — plan-row semantics)', () => {
  it('treats a stored 0 on a Plan row as a REAL limit (fully locked)', () => {
    expect(normalizeLimit(0, 'FREE')).toBe(0);
    expect(normalizeLimit(0, 'PRO')).toBe(0);
    expect(normalizeLimit(0, 'AGENCY')).toBe(0);
  });

  it('passes positive stored values through unchanged', () => {
    expect(normalizeLimit(100, 'FREE')).toBe(100);
    expect(normalizeLimit(500, 'PLUS')).toBe(500);
  });

  it('keeps -1 as unlimited', () => {
    expect(normalizeLimit(-1, 'FREE')).toBe(-1);
    expect(normalizeLimit(-1, 'AGENCY')).toBe(-1);
  });

  it('falls back per tier ONLY when no value is stored', () => {
    expect(normalizeLimit(null, 'FREE')).toBe(FREE_TIER_RESULT_LIMIT);
    expect(normalizeLimit(undefined, 'FREE')).toBe(FREE_TIER_RESULT_LIMIT);
    expect(normalizeLimit(null, 'PRO')).toBe(100);
    expect(normalizeLimit(null, 'PLUS')).toBe(500);
    expect(normalizeLimit(null, 'AGENCY')).toBe(-1);
    expect(normalizeLimit(undefined, 'ENTERPRISE')).toBe(-1);
  });

  it('falls back per tier for unrecognized negative values', () => {
    expect(normalizeLimit(-2, 'FREE')).toBe(FREE_TIER_RESULT_LIMIT);
    expect(normalizeLimit(-99, 'PRO')).toBe(100);
  });
});

describe('applyRowGate with a 0 limit (R9 N3)', () => {
  it('shows nothing and hides everything at limit 0', () => {
    expect(applyRowGate(250, 0)).toEqual({ visible: 0, hidden: 250 });
    expect(applyRowGate(1, 0)).toEqual({ visible: 0, hidden: 1 });
    expect(applyRowGate(0, 0)).toEqual({ visible: 0, hidden: 0 });
  });

  it('still treats -1 as unlimited and positive limits as caps', () => {
    expect(applyRowGate(250, -1)).toEqual({ visible: 250, hidden: 0 });
    expect(applyRowGate(250, 100)).toEqual({ visible: 100, hidden: 150 });
  });
});

describe('resolveDailyCap / envDailySearchCap (R9 N3)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the Plan row cap, including an intentional 0', () => {
    expect(resolveDailyCap(50)).toBe(50);
    expect(resolveDailyCap(0)).toBe(0);
  });

  it('falls back to the global default when the plan sets nothing', () => {
    vi.stubEnv('ADOBE_DAILY_SEARCH_LIMIT', '');
    expect(resolveDailyCap(null)).toBe(DEFAULT_DAILY_SEARCH_CAP);
    expect(resolveDailyCap(undefined)).toBe(DEFAULT_DAILY_SEARCH_CAP);
  });

  it('honours the env override when the plan sets nothing', () => {
    vi.stubEnv('ADOBE_DAILY_SEARCH_LIMIT', '7');
    expect(resolveDailyCap(null)).toBe(7);
    expect(envDailySearchCap()).toBe(7);
  });

  it('treats an explicit env 0 as a real cap, not as unset (R7-09)', () => {
    vi.stubEnv('ADOBE_DAILY_SEARCH_LIMIT', '0');
    expect(envDailySearchCap()).toBe(0);
    expect(resolveDailyCap(null)).toBe(0);
  });

  it('ignores invalid or negative env values', () => {
    vi.stubEnv('ADOBE_DAILY_SEARCH_LIMIT', 'abc');
    expect(envDailySearchCap()).toBe(DEFAULT_DAILY_SEARCH_CAP);
    vi.stubEnv('ADOBE_DAILY_SEARCH_LIMIT', '-5');
    expect(envDailySearchCap()).toBe(DEFAULT_DAILY_SEARCH_CAP);
  });
});
