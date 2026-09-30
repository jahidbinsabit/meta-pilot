/**
 * Fire-and-forget AI call logging (PROMPT 12 / PROMPT 9.1 / PROMPT 9.6).
 *
 * Every `generateWithAI` invocation writes one `AiCallLog` row recording the
 * tool, provider, model, latency, token usage, and success/failure. This is
 * what powers the admin's "test provider" and error-rate KPIs.
 *
 * The Prisma client is imported lazily inside `logAiCall` to break the
 * import cycle: `lib/db` eagerly starts the BullMQ workers at module load,
 * and those workers import the AI layer, which would otherwise re-enter
 * `logging` before `db` finished initializing.
 *
 * Failures here are swallowed: a logging error must never abort a generation
 * call or refund logic.
 */

import type { AiCallLogEntry } from '@/lib/ai/types';

export async function logAiCall(entry: AiCallLogEntry): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    await prisma.aiCallLog.create({
      data: {
        toolSlug: entry.toolSlug,
        provider: entry.provider,
        model: entry.model,
        latencyMs: entry.latencyMs,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.totalTokens,
        success: entry.success,
        errorMessage: entry.errorMessage,
        responseSchema: entry.responseSchema,
        parsedOk: entry.parsedOk,
      },
    });
  } catch (e) {
    // Never let logging break the caller.
    console.error('[ai] call-log write failed', e);
  }
}
