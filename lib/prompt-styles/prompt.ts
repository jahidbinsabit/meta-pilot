
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
No extra keys. No trailing text outside the JSON.
Never repeat words or phrases. Reach the requested length with concrete visual detail — never with repetition or filler.`;

export function buildImagePromptSystemInstruction(
  presetInstruction: string,
  strict = false,
  extraInstruction?: string,
) {
  return `${presetInstruction}

${SHAPE_INSTRUCTION}${extraInstruction ? `\n\n${extraInstruction}` : ''}${
    strict
      ? '\nSTRICT MODE: return ONLY the JSON object, nothing else. Even a single word outside the braces is an error.'
      : ''
  }`;
}

export function buildImagePromptUserPrompt(opts: {
  fileName?: string;
  strict?: boolean;
  targetChars?: number;
}) {
  const { strict = false, targetChars } = opts;
  const lengthLine = targetChars
    ? `\n- LENGTH (mandatory): the main prompt must be approximately ${targetChars} characters long (between ${Math.round(targetChars * 0.9)} and ${Math.round(targetChars * 1.1)} characters). Fit the full checklist below into that length — be dense with specifics, not brief and not padded.`
    : '';
  return `Analyze this image and create an exceptionally detailed, professional-grade prompt that would recreate it with maximum fidelity.

DETAIL CHECKLIST — every item must be covered in the prompt, at whatever length is requested:
- Subject: exactly what is depicted, its action/pose, and its most distinctive features
- Setting and environment: place, background, foreground, time of day, weather if visible
- Colors, materials, textures: exact color names (like "burnt sienna", "ultramarine blue"), surface qualities, fabrics, finishes
- Lighting: direction, intensity, color temperature (warm/cool), shadows, reflections, ambient conditions
- Camera and composition: angle, focal-length character, depth of field, framing, perspective, viewpoint
- Style and medium: photography/illustration/3D, technique, artistic movement, rendering and quality descriptors
- Mood and atmosphere: the emotional register and environmental cues that create it

REQUIREMENTS FOR HIGH-QUALITY PROMPTS:
- Be extremely specific about visual elements — generic words ("beautiful", "nice") are worthless; name the concrete detail instead
- Use industry-standard terminology for photography, art, and design
- Make it paste-ready for AI image generators like Midjourney, DALL-E, or Stable Diffusion${lengthLine}

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
