/**
 * Zod schemas for the structured outputs the AI layer is asked to produce.
 *
 * Each tool's callers pass one of these to `generateWithAI` as
 * `responseSchema`; the adapter enforces it at the provider level and
 * `BaseAdapter` parses + validates the response, so callers always get
 * typed data or a clean `parsed: null` (refunded, never thrown).
 */

import { z } from 'zod';

/** Metadata generator output (PROMPT 4). */
export const MetadataSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim(),
  keywords: z.array(z.string().trim().min(1)).min(1),
  altText: z.string().trim().optional().default(''),
});

export type MetadataResult = z.infer<typeof MetadataSchema>;

/** Image → Prompt output (PROMPT 5). */
export const ImagePromptSchema = z.object({
  prompt: z.string().trim().min(1),
  subject: z.string().trim().default(''),
  style: z.string().trim().default(''),
  lighting: z.string().trim().default(''),
  composition: z.string().trim().default(''),
  mood: z.string().trim().default(''),
});

export type ImagePromptResult = z.infer<typeof ImagePromptSchema>;

/** Adobe Stock keyword suggestions (PROMPT 10). */
export const AdobeKeywordsSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).min(1),
  longTail: z.array(z.string().trim().min(1)).default([]),
  categories: z.array(z.string().trim().min(1)).default([]),
});

export type AdobeKeywordsResult = z.infer<typeof AdobeKeywordsSchema>;
