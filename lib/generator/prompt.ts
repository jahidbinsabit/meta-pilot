import type { GeneratorSettings, TargetPlatform } from '@/lib/generator/types';

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

  const descGuidance = includeDescription
    ? `- Description: Concise summary (up to ${settings.descriptionLength} characters).`
    : `- Description: Do NOT generate a description. You MUST set "description" to an empty string "".`;

  let platformGuidance = '';
  switch (platform) {
    case 'adobe':
      platformGuidance = `Target agency: ADOBE STOCK.
- Title: Concise, natural, commercial title (at most ${settings.titleLength} characters). Avoid keyword stuffing.
- Keywords: Exactly ${settings.keywordsCount} distinct keywords.
  CRITICAL FOR ADOBE STOCK: Sort keywords in strict descending order of importance. The first 5-10 keywords MUST be the most critical, direct search terms describing the primary subject (Adobe weights the first 10 keywords most heavily).
${descGuidance}`;
      break;

    case 'shutterstock':
      platformGuidance = `Target agency: SHUTTERSTOCK.
- Title: Detailed descriptive sentence (minimum 5 words, ideally 8-15 words, up to ${settings.titleLength} characters). Describe who/what, action, setting, lighting, and camera angle.
- Keywords: Exactly ${settings.keywordsCount} keywords. Include literal objects, actions, scene setting, concepts, style, and synonyms.
${includeDescription ? `- Description: Rich descriptive caption (up to ${settings.descriptionLength} characters).` : descGuidance}`;
      break;

    case 'freepik':
      platformGuidance = `Target agency: FREEPIK.
- Title: Clean, commercial title (up to ${settings.titleLength} characters) highlighting design style (e.g., vector, 3D, realistic) and theme.
- Keywords: Exactly ${settings.keywordsCount} distinct lowercase keywords covering style, color, usage context (banner, poster, web), and subject.
${descGuidance}`;
      break;

    case 'vecteezy':
      platformGuidance = `Target agency: VECTEEZY.
- Title: Focused, search-optimized title (up to ${settings.titleLength} characters).
- Keywords: Exactly ${settings.keywordsCount} keywords tailored for vector/graphic/photo searches.
${includeDescription ? `- Description: Clear descriptive text (up to ${settings.descriptionLength} characters).` : descGuidance}`;
      break;

    case 'istock':
      platformGuidance = `Target agency: iSTOCK / GETTY IMAGES.
- Title: Clear, concise commercial/editorial title (up to ${settings.titleLength} characters).
- Keywords: Exactly ${settings.keywordsCount} keywords emphasizing conceptual themes, emotional resonance, and subject attributes.
${includeDescription ? `- Description: Descriptive caption (up to ${settings.descriptionLength} characters).` : descGuidance}`;
      break;

    default:
      platformGuidance = `Target: UNIVERSAL STOCK METADATA (Compatible with Adobe Stock, Shutterstock, Vecteezy, Freepik, iStock).
- Title: Balanced, descriptive stock title (up to ${settings.titleLength} characters).
- Keywords: Exactly ${settings.keywordsCount} high-relevance keywords sorted by relevance.
${includeDescription ? `- Description: Clear description (up to ${settings.descriptionLength} characters).` : descGuidance}`;
      break;
  }

  const descJsonKey = includeDescription
    ? `- "description": string, at most ${settings.descriptionLength} characters`
    : `- "description": empty string "" (Do not generate a description)`;

  const systemPrompt = `You are a world-class SEO metadata specialist for stock photography and vector microstock agencies.
${platformGuidance}
Return ONLY a single JSON object. Do not wrap it in markdown fences, do not add commentary.
The JSON object must have exactly these keys:
- "title": string, at most ${settings.titleLength} characters${prefix}${suffix}${negTitle}
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
Title max ${settings.titleLength} chars. ${descClause}
Keywords: exactly ${settings.keywordsCount} strings (sorted by importance). No markdown, no fences, no extra text.`;
}

