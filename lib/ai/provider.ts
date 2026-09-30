/**
 * Legacy provider module (kept for backwards compatibility).
 *
 * The canonical entry point is `generateWithAI` in `lib/ai/router.ts`. This
 * module re-exports the same surface under the old names so existing routes
 * that import from `@/lib/ai/provider` keep working while they migrate.
 */

export {
  generateAi,
  getAdapterForTool,
  getActiveProviderForTool,
  getProviderConfigForTool,
  getToolProviderMap,
  healthCheckAll,
} from '@/lib/ai/router';

export type { AiAdapter, AiRequest, AiResponse, ProviderConfig } from '@/lib/ai/types';
