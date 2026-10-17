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
- "prompt": string — the single paste-ready generation prompt that reconstructs the image (250-350 words, never over 400)
- "subject": string — what is depicted (a phrase)
- "style": string — medium / art style (a phrase)
- "lighting": string — light direction and quality (a phrase)
- "composition": string — framing and camera angle (a phrase)
- "mood": string — the emotional register (a phrase)
No extra keys. No trailing text outside the JSON.
Describe each element fully but ONCE — do not repeat or elaborate beyond 400 words total for the prompt.`;

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
  return `Analyze this image and create a detailed, professional-grade prompt that would recreate it with high fidelity.

REQUIREMENTS FOR HIGH-QUALITY PROMPTS:
- Describe visual elements specifically: colors, materials, textures, and surface qualities
- Describe lighting: direction, intensity, color temperature (warm/cool), shadows, reflections
- Specify composition: camera angle, depth of field, framing, perspective, viewpoint
- Include style markers: medium, technique, artistic movement, rendering style
- Capture mood and atmosphere through environmental and emotional cues
- Use industry-standard terminology for photography, art, and design
- Make it paste-ready for AI image generators like Midjourney, DALL-E, or Stable Diffusion

LENGTH: Write 250-350 words for the prompt. Do NOT exceed 400 words under any circumstances. When you have covered subject, style, lighting, composition and mood, STOP — do not restate or add further elaboration.
${
  strict
    ? 'STRICT MODE: return ONLY the JSON object, nothing else. Even a single word outside the braces is an error.'
    : ''
}`;
}
