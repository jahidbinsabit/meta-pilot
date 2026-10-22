/**
 * Repetition-loop trimmer for AI-generated text.
 *
 * Flash-class models (notably gemini-3.5-flash-lite on Image → Prompt)
 * sometimes fail to stop: after producing a complete, high-quality prompt
 * they fall into a degenerate loop — "standard output successfully standard
 * format structure maintained strictly standard…" — repeated until the token
 * cap. The junk wastes output tokens (and therefore most of the call's
 * latency) and makes the result unusable.
 *
 * `trimRepetitionLoop` detects the loop deterministically, at the word
 * level, via 4-gram *novelty*: in natural prose almost every 4-word
 * sequence is new, while in loop text nearly every 4-gram has already
 * appeared earlier in the same output (the model cycles a tiny vocabulary
 * or repeats whole phrases verbatim). When the novelty of a sliding
 * window collapses AND stays collapsed, the text is cut at the last
 * complete sentence before the loop began.
 *
 * The detector is deliberately conservative — a legitimately long, detailed
 * prompt (with normally-repeated stock terms) keeps producing novel
 * 4-grams throughout and passes through byte-for-byte unchanged.
 */

/** Words per sliding novelty window. */
const WINDOW_WORDS = 40;
/** N-gram size used for the novelty measurement. */
const NGRAM_SIZE = 4;
/**
 * A window is "collapsed" when fewer than this fraction of its 4-grams are
 * novel (i.e. not seen earlier in the text). Natural descriptive prose
 * scores ~0.85–1.0; loop junk ~0.0–0.3.
 */
const COLLAPSE_THRESHOLD = 0.5;
/** How far ahead (in words) a collapse must persist to count as a loop. */
const CONFIRM_OFFSET_WORDS = 20;

interface WordToken {
  norm: string;
  start: number;
}

function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ norm: normalizeWord(m[0]), start: m.index });
  }
  return tokens;
}

/** All n-grams of the token stream, as joined normalized strings. */
function buildNgrams(words: WordToken[]): string[] {
  const grams: string[] = [];
  for (let k = 0; k + NGRAM_SIZE <= words.length; k++) {
    let gram = '';
    for (let j = 0; j < NGRAM_SIZE; j++) {
      gram += (j === 0 ? '' : ' ') + words[k + j].norm;
    }
    grams.push(gram);
  }
  return grams;
}

/**
 * Index (into `words`) of the first word of a sustained repetition loop,
 * or -1 when the text keeps producing novel n-grams throughout.
 */
function findLoopStart(words: WordToken[]): number {
  if (words.length < WINDOW_WORDS) return -1;
  const grams = buildNgrams(words);
  // firstSeen[k] = index of the first occurrence of grams[k].
  const firstSeen = new Array<number>(grams.length);
  const seenAt = new Map<string, number>();
  for (let k = 0; k < grams.length; k++) {
    const prev = seenAt.get(grams[k]);
    if (prev === undefined) {
      seenAt.set(grams[k], k);
      firstSeen[k] = k;
    } else {
      firstSeen[k] = prev;
    }
  }

  const gramsPerWindow = WINDOW_WORDS - NGRAM_SIZE + 1;
  // A window starting at word i is collapsed when most of its n-grams
  // already occurred before the window began.
  const collapsed = (i: number) => {
    let novel = 0;
    for (let k = i; k < i + gramsPerWindow; k++) {
      if (firstSeen[k] >= i) novel++;
    }
    return novel / gramsPerWindow < COLLAPSE_THRESHOLD;
  };

  const lastStart = words.length - WINDOW_WORDS;
  for (let i = 0; i <= lastStart; i++) {
    if (!collapsed(i)) continue;
    // The collapse must persist: check a window further ahead. When the
    // degenerate region runs to the end of the text, the clamped window
    // is the last one — it must be collapsed too.
    const j = Math.min(i + CONFIRM_OFFSET_WORDS, lastStart);
    if (j > i && !collapsed(j)) continue;
    return i;
  }
  return -1;
}

/**
 * Character index just past the last sentence-ending punctuation before
 * `beforeChar`, or -1 when there is none. A `.`/`!`/`?` only counts when
 * followed by whitespace, a quote/bracket, or the end of the string — so
 * decimals ("2.5") and similar are not mistaken for sentence ends.
 */
function sentenceEndBefore(text: string, beforeChar: number): number {
  for (let k = beforeChar - 1; k >= 0; k--) {
    const c = text[k];
    if (c !== '.' && c !== '!' && c !== '?') continue;
    const next = k + 1 < text.length ? text[k + 1] : '';
    if (next === '' || /[\s"')\]]/.test(next)) return k + 1;
  }
  return -1;
}

/**
 * Remove a trailing repetition loop from `text`. Returns the input
 * unchanged when no sustained loop is detected.
 */
export function trimRepetitionLoop(text: string): string {
  if (!text) return text;
  const words = tokenize(text);
  const loopIdx = findLoopStart(words);
  if (loopIdx < 0) return text;

  const loopStartChar = words[loopIdx].start;
  const sentenceEnd = sentenceEndBefore(text, loopStartChar);
  const cutChar = sentenceEnd > 0 ? sentenceEnd : loopStartChar;
  const trimmed = text.slice(0, cutChar).trim();
  // Safety net: never destroy the whole value (a loop starting at word 0
  // leaves nothing salvageable, and callers prefer the raw text to an
  // empty string in that pathological case).
  return trimmed.length > 0 ? trimmed : text;
}

/** Non-`prompt` string fields longer than this are also loop-checked. */
const LONG_FIELD_CHARS = 400;

/**
 * Apply {@link trimRepetitionLoop} to an Image → Prompt result: always to
 * `prompt`, and to any other string field long enough to plausibly contain
 * a loop (subject/style/lighting/composition/mood are normally one line).
 */
export function cleanImagePromptResult<T>(parsed: T): T {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const out: Record<string, unknown> = {
    ...(parsed as Record<string, unknown>),
  };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string') continue;
    if (key === 'prompt' || value.length > LONG_FIELD_CHARS) {
      out[key] = trimRepetitionLoop(value);
    }
  }
  return out as T;
}
