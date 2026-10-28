import type { GeneratorSettings, TargetPlatform } from '@/lib/generator/types';

/**
 * Title length is a TARGET the model must aim for — not a ceiling.
 * Until R7 the prompts said "at most N characters", so raising the
 * user's setting changed nothing (the model wrote its natural short
 * title under the cap) and lowering it only truncated harder.
 */
export function titleTargetClause(settings: GeneratorSettings): string {
  const target = settings.titleLength;
  const lo = Math.max(1, Math.round(target * 0.9));
  const hi = Math.round(target * 1.1);
  return `approximately ${target} characters long (between ${lo} and ${hi} characters)`;
}

/**
 * Per-platform guidance block shared by the single-image and batch prompt
 * builders so both apply identical agency rules.
 */
export function platformGuidanceFor(
  settings: GeneratorSettings,
  platform: TargetPlatform = 'adobe',
): string {
  const includeDescription = settings.includeDescription !== false;
  const descGuidance = includeDescription
    ? `- Description: Concise summary (up to ${settings.descriptionLength} characters).`
    : `- Description: Do NOT generate a description. You MUST set "description" to an empty string "".`;

  switch (platform) {
    case 'adobe':
      return `Target agency: ADOBE STOCK.
- Title: Concise, natural, commercial title, ${titleTargetClause(settings)}. Avoid keyword stuffing.
- Keywords: Exactly ${settings.keywordsCount} distinct keywords.
  CRITICAL FOR ADOBE STOCK: Sort keywords in strict descending order of importance. The first 5-10 keywords MUST be the most critical, direct search terms describing the primary subject (Adobe weights the first 10 keywords most heavily).
${descGuidance}`;

    case 'shutterstock':
      return `Target agency: SHUTTERSTOCK.
- Title: Detailed descriptive sentence (${titleTargetClause(settings)}; minimum 5 words). Describe who/what, action, setting, lighting, and camera angle.
- Keywords: Exactly ${settings.keywordsCount} keywords. Include literal objects, actions, scene setting, concepts, style, and synonyms.
${includeDescription ? `- Description: Rich descriptive caption (up to ${settings.descriptionLength} characters).` : descGuidance}`;

    case 'freepik':
      return `Target agency: FREEPIK.
- Title: Clean, commercial title (${titleTargetClause(settings)}) highlighting design style (e.g., vector, 3D, realistic) and theme.
- Keywords: Exactly ${settings.keywordsCount} distinct lowercase keywords covering style, color, usage context (banner, poster, web), and subject.
${descGuidance}`;

    case 'vecteezy':
      return `Target agency: VECTEEZY.
- Title: Focused, search-optimized title (${titleTargetClause(settings)}).
- Keywords: Exactly ${settings.keywordsCount} keywords tailored for vector/graphic/photo searches.
${includeDescription ? `- Description: Clear descriptive text (up to ${settings.descriptionLength} characters).` : descGuidance}`;

    case 'istock':
      return `Target agency: iSTOCK / GETTY IMAGES.
- Title: Clear, concise commercial/editorial title (${titleTargetClause(settings)}).
- Keywords: Exactly ${settings.keywordsCount} keywords emphasizing conceptual themes, emotional resonance, and subject attributes.
${includeDescription ? `- Description: Descriptive caption (up to ${settings.descriptionLength} characters).` : descGuidance}`;

    default:
      return `Target: UNIVERSAL STOCK METADATA (Compatible with Adobe Stock, Shutterstock, Vecteezy, Freepik, iStock).
- Title: Balanced, descriptive stock title (${titleTargetClause(settings)}).
- Keywords: Exactly ${settings.keywordsCount} high-relevance keywords sorted by relevance.
${includeDescription ? `- Description: Clear description (up to ${settings.descriptionLength} characters).` : descGuidance}`;
  }
}

/**
 * Builds strict-JSON prompts for the metadata generator,
 * optimized for each stock platform's specific algorithm and rules.
 */
export function buildMetadataPrompt(opts: {
  settings: GeneratorSettings;
  imageDescription: string;
  fileName?: string;
  platform?: TargetPlatform;
  strict?: boolean;
}) {
  const { settings, imageDescription, fileName, platform = 'adobe', strict = false } = opts;
  const includeDescription = settings.includeDescription !== false;

  const negTitle = settings.negativeTitleWords.length
    ? `\nNEVER use these words in the title: ${settings.negativeTitleWords.join(', ')}.`
    : '';
  const negKw = settings.negativeKeywords.length
    ? `\nNEVER include these keywords: ${settings.negativeKeywords.join(', ')}.`
    : '';
  const prefix = settings.prefix
    ? `\nPrepend this exact prefix to the title: "${settings.prefix}".`
    : '';
  const suffix = settings.suffix
    ? `\nAppend this exact suffix to the title: "${settings.suffix}".`
    : '';

  const platformGuidance = platformGuidanceFor(settings, platform);

  const descJsonKey = includeDescription
    ? `- "description": string, at most ${settings.descriptionLength} characters`
    : `- "description": empty string "" (Do not generate a description)`;

  const systemPrompt = `You are a world-class SEO metadata specialist for stock photography and vector microstock agencies.
${platformGuidance}
Return ONLY a single JSON object. Do not wrap it in markdown fences, do not add commentary.
The JSON object must have exactly these keys:
- "title": string, ${titleTargetClause(settings)}${prefix}${suffix}${negTitle}
${descJsonKey}
- "keywords": array of exactly ${settings.keywordsCount} strings adhering to platform ranking rules${negKw}
- "altText": string, accessible alt text (1-2 sentences)
No extra keys. No trailing text outside JSON.`;

  const userPrompt = `Image filename: ${fileName || 'image'}
Image description: ${imageDescription}
Target platform: ${platform.toUpperCase()}
${strict ? 'STRICT MODE: return ONLY the JSON object, nothing else.' : ''}`;

  return { systemPrompt, userPrompt };
}

export function buildRetrySystemPrompt(opts: {
  settings: GeneratorSettings;
  platform?: TargetPlatform;
}) {
  const { settings, platform = 'adobe' } = opts;
  const includeDescription = settings.includeDescription !== false;
  const descClause = includeDescription
    ? `Description max ${settings.descriptionLength} chars.`
    : `Set "description" to an empty string "".`;
  return `Return ONLY a JSON object with keys title, description, keywords, altText.
Target Platform: ${platform.toUpperCase()}.
Title: ${titleTargetClause(settings)}. ${descClause}
Keywords: exactly ${settings.keywordsCount} strings (sorted by importance). No markdown, no fences, no extra text.`;
}

/**
 * Builds prompts for a multi-image batch call: up to N images are sent in ONE
 * API request (in order) and the model returns one metadata object per image
 * inside a { "results": [...] } envelope, keyed by 1-based "index".
 * Same per-image rules as buildMetadataPrompt.
 */
export function buildMetadataBatchPrompt(opts: {
  settings: GeneratorSettings;
  images: { fileName?: string; description: string }[];
  platform?: TargetPlatform;
}) {
  const { settings, images, platform = 'adobe' } = opts;
  const includeDescription = settings.includeDescription !== false;
  const count = images.length;

  const negTitle = settings.negativeTitleWords.length
    ? `\nNEVER use these words in any title: ${settings.negativeTitleWords.join(', ')}.`
    : '';
  const negKw = settings.negativeKeywords.length
    ? `\nNEVER include these keywords: ${settings.negativeKeywords.join(', ')}.`
    : '';
  const prefix = settings.prefix
    ? `\nPrepend this exact prefix to every title: "${settings.prefix}".`
    : '';
  const suffix = settings.suffix
    ? `\nAppend this exact suffix to every title: "${settings.suffix}".`
    : '';

  const platformGuidance = platformGuidanceFor(settings, platform);

  const descJsonKey = includeDescription
    ? `- "description": string, at most ${settings.descriptionLength} characters`
    : `- "description": empty string "" (Do not generate a description)`;

  const systemPrompt = `You are a world-class SEO metadata specialist for stock photography and vector microstock agencies.
${platformGuidance}
You will receive ${count} images, attached IN ORDER. Their positions are numbered 1 to ${count}.
Return ONLY a single JSON object. Do not wrap it in markdown fences, do not add commentary.
The JSON object must have exactly this shape:
{ "results": [ { "index": 1, "title": "...", "description": "...", "keywords": ["..."], "altText": "..." } ] }
"results" must contain exactly ${count} entries — one entry per image, in image order. Apply the platform rules and length targets above to EVERY entry. Each entry must have exactly these keys:
- "index": the 1-based position of the image this entry describes (1 = first image, 2 = second image, and so on)
- "title": string, ${titleTargetClause(settings)}${prefix}${suffix}${negTitle}
${descJsonKey}
- "keywords": array of exactly ${settings.keywordsCount} strings adhering to platform ranking rules${negKw}
- "altText": string, accessible alt text (1-2 sentences)
No extra keys. No trailing text outside JSON.`;

  const userPrompt = `${images
    .map(
      (img, i) =>
        `Image ${i + 1}:\nFilename: ${img.fileName || 'image'}\nDescription: ${img.description}`,
    )
    .join('\n\n')}
Target platform: ${platform.toUpperCase()}`;

  return { systemPrompt, userPrompt };
}

export function buildRetryBatchSystemPrompt(opts: {
  settings: GeneratorSettings;
  platform?: TargetPlatform;
  count: number;
}) {
  const { settings, platform = 'adobe', count } = opts;
  const includeDescription = settings.includeDescription !== false;
  const descClause = includeDescription
    ? `Description max ${settings.descriptionLength} chars.`
    : `Set "description" to an empty string "" in every entry.`;
  return `Return ONLY a JSON object of the form { "results": [ { "index": 1, "title": "...", "description": "...", "keywords": ["..."], "altText": "..." } ] } with exactly ${count} entries — one per image, in order — where "index" is the 1-based image position.
Target Platform: ${platform.toUpperCase()}.
Title: ${titleTargetClause(settings)}. ${descClause}
Keywords per entry: exactly ${settings.keywordsCount} strings (sorted by importance). No markdown, no fences, no extra text.`;
}


/**
 * Post-generation title guard. The prompt now asks for a TARGET length,
 * so this is only a safety net for wild overshoot — it no longer slices
 * every title at the setting (which used to cut mid-word and made the
 * setting behave like a hard ceiling). Titles within +25% of the target
 * pass through untouched; longer ones are trimmed at a word boundary
 * near +10%.
 */
export function fitTitleToTarget(title: string, target: number): string {
  const hardCap = Math.round(target * 1.25);
  if (title.length <= hardCap) return title;
  const cut = title.slice(0, Math.round(target * 1.1));
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > target * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}
