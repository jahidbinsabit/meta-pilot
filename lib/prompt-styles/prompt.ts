import type { ImagePromptResult } from '@/lib/prompt-styles/types';

/**
 * Builds the prompts for the Image → Prompt tool (PROMPT 5).
 *
 * The *system* instruction comes from the admin-configured preset — this
 * module only supplies the shared contract (strict JSON shape + the
 * subject/style/lighting/composition/mood breakdown) so every preset yields
 * a result the UI can render consistently.
 */

/** Shared JSON contract, appended to every preset's system instruction. */
const SHAPE_INSTRUCTION = `Return ONLY a single JSON object. Do not wrap it in markdown fences, do not add commentary.
The JSON object must have exactly these keys:
- "prompt": string — the single paste-ready generation prompt that reconstructs the image
- "subject": string — what is depicted
- "style": string — medium / art style
- "lighting": string — light direction, quality, colour temperature
- "composition": string — framing, camera angle, depth of field
- "mood": string — the emotional register
No extra keys. No trailing text outside the JSON.`;

export function buildImagePromptSystemInstruction(presetInstruction: string, strict = false) {
  return `${presetInstruction}

${SHAPE_INSTRUCTION}${
    strict
      ? '\nSTRICT MODE: return ONLY the JSON object, nothing else. Even a single word outside the braces is an error.'
      : ''
  }`;
}

export function buildImagePromptUserPrompt(opts: { fileName?: string; strict?: boolean }) {
  const { fileName, strict = false } = opts;
  return `Analyze this image and create an exceptionally detailed, professional-grade prompt that would recreate it with maximum fidelity.

REQUIREMENTS FOR HIGH-QUALITY PROMPTS:
- Be extremely specific about visual elements: exact colors (use specific color names like "burnt sienna", "ultramarine blue"), materials, textures, and surface qualities
- Describe lighting in technical detail: direction, intensity, color temperature (warm/cool), shadow characteristics, reflections, and ambient conditions
- Specify exact composition elements: camera angle, focal length characteristics, depth of field, framing, perspective, and viewpoint
- Include artistic style markers: medium, technique, artistic movement, rendering style, and quality descriptors
- Capture mood and atmosphere through specific environmental and emotional cues
- Use industry-standard terminology for photography, art, and design
- Ensure the prompt is 150-300 words for comprehensive detail
- Make it paste-ready for AI image generators like Midjourney, DALL-E, or Stable Diffusion

Focus on creating a prompt that captures not just what is shown, but HOW it's shown - the technical and artistic execution that makes the image distinctive.
${
  strict
    ? 'STRICT MODE: return ONLY the JSON object, nothing else. Even a single word outside the braces is an error.'
    : ''
}`;
}

/**
 * Validates and normalizes whatever the model returned. Returns null when the
 * payload has no usable prompt, which the caller treats as a failure so the
 * credit is refunded.
 */
export function parseImagePromptResult(raw: string): ImagePromptResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (!prompt) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    ...obj,
    prompt,
    subject: str(obj.subject),
    style: str(obj.style),
    lighting: str(obj.lighting),
    composition: str(obj.composition),
    mood: str(obj.mood),
  };
}
