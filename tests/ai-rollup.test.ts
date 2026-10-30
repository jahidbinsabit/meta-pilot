import { describe, it, expect } from 'vitest';
import { summarizeAiCallRows, type AiCallRollupRow } from '@/lib/ai/rollup';

function row(partial: Partial<AiCallRollupRow> = {}): AiCallRollupRow {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    success: true,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    latencyMs: 1000,
    ...partial,
  };
}

describe('summarizeAiCallRows', () => {
  it('returns zeros and empty groups for an empty set', () => {
    const s = summarizeAiCallRows([]);
    expect(s.calls).toBe(0);
    expect(s.successes).toBe(0);
    expect(s.failures).toBe(0);
    expect(s.promptTokens).toBe(0);
    expect(s.completionTokens).toBe(0);
    expect(s.totalTokens).toBe(0);
    expect(s.latencyMsTotal).toBe(0);
    expect(s.byProvider).toEqual({});
    expect(s.byModel).toEqual({});
  });

  it('counts mixed success/failure rows', () => {
    const s = summarizeAiCallRows([
      row({ success: true }),
      row({ success: true }),
      row({ success: false }),
      row({ success: false }),
      row({ success: false }),
    ]);
    expect(s.calls).toBe(5);
    expect(s.successes).toBe(2);
    expect(s.failures).toBe(3);
  });

  it('sums token and latency fields across rows', () => {
    const s = summarizeAiCallRows([
      row({ promptTokens: 10, completionTokens: 5, totalTokens: 15, latencyMs: 100 }),
      row({ promptTokens: 20, completionTokens: 7, totalTokens: 27, latencyMs: 250 }),
      row({ promptTokens: 1, completionTokens: 2, totalTokens: 3, latencyMs: 50 }),
    ]);
    expect(s.promptTokens).toBe(31);
    expect(s.completionTokens).toBe(14);
    expect(s.totalTokens).toBe(45);
    expect(s.latencyMsTotal).toBe(400);
  });

  it('treats null token fields as zero', () => {
    const s = summarizeAiCallRows([
      row({ promptTokens: null, completionTokens: null, totalTokens: null }),
      row({ promptTokens: 40, completionTokens: null, totalTokens: null }),
    ]);
    expect(s.promptTokens).toBe(40);
    expect(s.completionTokens).toBe(0);
    // Second row has no recorded total: falls back to prompt+completion.
    expect(s.totalTokens).toBe(40);
  });

  it('prefers a recorded totalTokens over the prompt+completion sum', () => {
    const s = summarizeAiCallRows([
      row({ promptTokens: 10, completionTokens: 5, totalTokens: 99 }),
    ]);
    expect(s.totalTokens).toBe(99);
  });

  it('groups calls and tokens by provider', () => {
    const s = summarizeAiCallRows([
      row({ provider: 'gemini', totalTokens: 150 }),
      row({ provider: 'gemini', totalTokens: 50 }),
      row({ provider: 'openai', totalTokens: 300 }),
      row({ provider: 'grok', promptTokens: null, completionTokens: null, totalTokens: null }),
    ]);
    expect(s.byProvider).toEqual({
      gemini: { calls: 2, totalTokens: 200 },
      openai: { calls: 1, totalTokens: 300 },
      grok: { calls: 1, totalTokens: 0 },
    });
  });

  it('groups calls and tokens by model, independently of provider', () => {
    const s = summarizeAiCallRows([
      row({ provider: 'gemini', model: 'gemini-2.5-flash', totalTokens: 100 }),
      row({ provider: 'gemini', model: 'gemini-2.5-pro', totalTokens: 200 }),
      row({ provider: 'openai', model: 'gemini-2.5-flash', totalTokens: 30 }),
    ]);
    expect(s.byModel).toEqual({
      'gemini-2.5-flash': { calls: 2, totalTokens: 130 },
      'gemini-2.5-pro': { calls: 1, totalTokens: 200 },
    });
  });
});
