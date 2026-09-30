export interface PromptStylePreset {
  id: string;
  slug: string;
  label: string;
  systemInstruction: string;
  sortOrder: number;
  isActive: boolean;
}

/** Shape returned to the dashboard — omits nothing, but kept as its own type
 *  so the admin editor can reuse it. */
export type PromptStylePresetInput = Omit<PromptStylePreset, 'id'>;

/** The result the AI is asked to return for one image. */
export interface ImagePromptResult {
  /** The single paste-ready prompt. This is the primary output. */
  prompt: string;
  subject: string;
  style: string;
  lighting: string;
  composition: string;
  mood: string;
  /** Anything else the model returns, preserved rather than dropped. */
  [key: string]: unknown;
}
