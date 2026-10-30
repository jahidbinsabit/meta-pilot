/** Display name for a provider slug — CSS `capitalize` would render "Openai". */
export const PROVIDER_LABELS: Record<string, string> = {
  auto: 'Auto',
  gemini: 'Gemini',
  grok: 'Grok',
  openai: 'OpenAI',
};

export function providerLabel(slug: string): string {
  return PROVIDER_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}
