import { describe, it, expect } from 'vitest';
import { tierAllowedForTool } from '@/lib/tools/gate';

describe('tierAllowedForTool (R9 B9-05 tier-gate predicate)', () => {
  it('allows every tier when the allow-list is null, undefined or empty', () => {
    expect(tierAllowedForTool(null, 'FREE')).toBe(true);
    expect(tierAllowedForTool(undefined, 'FREE')).toBe(true);
    expect(tierAllowedForTool([], 'FREE')).toBe(true);
    expect(tierAllowedForTool(null, 'AGENCY')).toBe(true);
  });

  it('allows tiers on the list and refuses tiers off it', () => {
    expect(tierAllowedForTool(['PRO', 'PLUS', 'AGENCY'], 'PRO')).toBe(true);
    expect(tierAllowedForTool(['PRO', 'PLUS', 'AGENCY'], 'PLUS')).toBe(true);
    expect(tierAllowedForTool(['PRO', 'PLUS', 'AGENCY'], 'FREE')).toBe(false);
    expect(tierAllowedForTool(['AGENCY'], 'PRO')).toBe(false);
  });

  it('compares case-insensitively on both sides', () => {
    expect(tierAllowedForTool(['pro'], 'PRO')).toBe(true);
    expect(tierAllowedForTool(['PRO'], 'pro')).toBe(true);
    expect(tierAllowedForTool(['Agency'], 'AGENCY')).toBe(true);
  });

  it('ignores non-string entries in the list', () => {
    expect(tierAllowedForTool(['PRO', 42 as unknown as string], 'PRO')).toBe(true);
    expect(tierAllowedForTool([42 as unknown as string], 'FREE')).toBe(false);
  });
});
