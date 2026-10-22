import { describe, it, expect } from 'vitest';

import { trimRepetitionLoop, cleanImagePromptResult } from '@/lib/ai/text-clean';

// ---------------------------------------------------------------------------
// trimRepetitionLoop — kills the degenerate filler flash-class models emit
// after a complete image prompt ("standard output successfully standard
// format…"). Must never touch legitimate detailed prose.
// ---------------------------------------------------------------------------

const GOOD_PROSE =
  'An elderly woman with silver hair reading a book in a sunlit room, accompanied by physical therapy equipment arranged neatly beside her chair. She wears a cozy cream-colored knitted cardigan, and indoor plants are visible on the windowsill behind her. Warm natural light streams through sheer curtains, casting gentle golden highlights across her profile and illuminating fine dust motes drifting in the quiet air. The composition is balanced, calm, and editorial in style.';

/** Small-vocabulary shuffled junk, closely mimicking the real loop output. */
function shuffledJunk(targetWords = 220): string {
  const frags = [
    'standard output', 'successfully achieved', 'standard format', 'maintained strictly standard',
    'standard compliance verified', 'standard delivery', 'guaranteed correctly', 'standard way',
    'without deviations', 'present standard', 'standard expectations met', 'successfully standard',
    'format structure', 'standard adherence complete', 'valid output', 'standard presentation',
    'correctly maintained', 'standard framework', 'standard output standard', 'compliance guaranteed',
  ];
  const words: string[] = [];
  let fi = 0;
  while (words.length < targetWords) {
    words.push(...frags[fi % frags.length].split(' '));
    fi += 3; // stride so combinations shuffle instead of repeating verbatim
  }
  return words.join(' ');
}

/** The same junk phrase repeated verbatim (long-cycle repetition). */
function verbatimJunk(targetWords = 220): string {
  const phrase =
    'standard output successfully achieved standard format structure maintained strictly standard standard compliance verified successfully standard delivery guaranteed correctly standard output generation compliant completely standard expectations met successfully without issues whatsoever standard framework adherence complete valid output standard JSON structure validated strictly standard way';
  let out = '';
  while (out.split(/\s+/).length < targetWords) out += phrase + ' ';
  return out.trim();
}

const LEGIT_LONG_PROMPT = [
  'A breathtaking aerial photograph of a rugged Icelandic coastline at golden hour, waves crashing against black basalt columns, sea spray frozen mid-air by a fast shutter speed.',
  'Shot on a medium format camera with a 35mm wide-angle lens, deep depth of field keeping both foreground rocks and distant glacier in razor-sharp focus, photorealistic detail in every wet stone texture.',
  'The palette leans into moody teal shadows and warm amber highlights, with soft volumetric light breaking through low storm clouds and reflecting off tidal pools scattered across the volcanic sand.',
  'Editorial travel photography style, ultra detailed rock formations, ultra detailed water movement, crisp atmospheric perspective, subtle film grain, and a serene yet dramatic mood that invites quiet contemplation of wild northern landscapes.',
  'In the middle distance a lone photographer in a red waterproof jacket stands on a mossy outcrop, providing human scale against the vast seascape, gazing toward a distant lighthouse blinking through the coastal mist.',
  'Every element is rendered with photorealistic clarity: individual droplets on the lens-facing rocks, foam patterns tracing the shoreline, wind-bent grasses in the foreground dunes, and layered cloud banks receding toward the horizon line.',
  'The image is composed using the rule of thirds, with the horizon placed along the upper third and the reflective wet sand mirroring the sky in the lower third, creating a symmetrical balance that draws the eye toward the vanishing point.',
  'Gentle post-processing preserves natural color grading, lifts the shadows slightly to reveal detail in the darker rocks, and adds a whisper of clarity to the midtones without making the scene feel artificial or overworked.',
  'Suitable for a premium travel magazine cover, a tourism campaign for the Icelandic highlands, or a large-format fine art print displayed in a modern coastal home, the photograph balances documentary honesty with an unmistakably cinematic atmosphere.',
].join(' ');

describe('trimRepetitionLoop', () => {
  it('cuts shuffled small-vocabulary loop junk, keeping only the good prose', () => {
    const looped = GOOD_PROSE + ' ' + shuffledJunk();
    const out = trimRepetitionLoop(looped);
    expect(out).toBe(GOOD_PROSE);
    expect(out.endsWith('.')).toBe(true);
    expect(out.split(/\s+/).length).toBeLessThan(looped.split(/\s+/).length / 3);
  });

  it('cuts verbatim-repeated phrase loops', () => {
    const looped = GOOD_PROSE + ' ' + verbatimJunk();
    expect(trimRepetitionLoop(looped)).toBe(GOOD_PROSE);
  });

  it('leaves a legitimately long, detailed prompt completely unchanged', () => {
    expect(LEGIT_LONG_PROMPT.split(/\s+/).length).toBeGreaterThan(280);
    expect(trimRepetitionLoop(LEGIT_LONG_PROMPT)).toBe(LEGIT_LONG_PROMPT);
  });

  it('leaves a single intentionally repeated sentence unchanged', () => {
    const reprise =
      LEGIT_LONG_PROMPT +
      ' As the saying goes, the sea remembers everything. The waves keep returning to the black sand shore. As the saying goes, the sea remembers everything.';
    expect(trimRepetitionLoop(reprise)).toBe(reprise);
  });

  it('leaves short text unchanged', () => {
    const short = 'A cat on a mat, soft window light, shallow depth of field.';
    expect(trimRepetitionLoop(short)).toBe(short);
  });

  it('leaves the empty string unchanged', () => {
    expect(trimRepetitionLoop('')).toBe('');
  });
});

describe('cleanImagePromptResult', () => {
  it('cleans the prompt field and leaves short fields untouched', () => {
    const parsed = {
      prompt: GOOD_PROSE + ' ' + shuffledJunk(),
      subject: 'elderly woman reading indoors',
      style: 'editorial photography',
      lighting: 'warm natural window light',
      composition: 'balanced, subject right of center',
      mood: 'calm and serene',
    };
    const cleaned = cleanImagePromptResult(parsed);
    expect(cleaned.prompt).toBe(GOOD_PROSE);
    expect(cleaned.subject).toBe(parsed.subject);
    expect(cleaned.style).toBe(parsed.style);
    expect(cleaned.mood).toBe(parsed.mood);
  });

  it('also cleans a non-prompt field only when it is long enough to loop', () => {
    const longSubject = GOOD_PROSE + ' ' + shuffledJunk();
    const cleaned = cleanImagePromptResult({ prompt: 'ok prompt', subject: longSubject });
    expect(cleaned.subject).toBe(GOOD_PROSE);
    expect(cleaned.prompt).toBe('ok prompt');
  });

  it('passes non-objects through unchanged', () => {
    expect(cleanImagePromptResult(null)).toBeNull();
    expect(cleanImagePromptResult('raw text')).toBe('raw text');
  });
});
