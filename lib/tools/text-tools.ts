/**
 * Deterministic text tools (Audit R6 / N3 honesty fix).
 *
 * Pure functions — no AI, no I/O. Each tool either returns a real,
 * computed result or throws `ToolValidationError`, which the
 * /api/tools/run route turns into a 400 with NO credit charge.
 * (Previously these slugs charged 1 credit and echoed the input back.)
 */

export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lowercase word tokens; keeps unicode letters/numbers, apostrophes, hyphens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter((w) => w.length > 0);
}

// ---------------------------------------------------------------------------
// keyword-density
// ---------------------------------------------------------------------------

export function keywordDensity(rawInput: string) {
  const input = String(rawInput ?? '');
  const lines = input.split(/\r?\n/);
  const sepIdx = lines.findIndex((l) => l.trim() === '---');

  if (sepIdx >= 0) {
    // Targeted mode: text above `---`, target keywords (one per line) below.
    const text = lines.slice(0, sepIdx).join('\n');
    const targets = lines
      .slice(sepIdx + 1)
      .map((s) => s.trim())
      .filter(Boolean);
    const words = tokenize(text);
    if (words.length === 0) {
      throw new ToolValidationError('Paste the text to analyse above the --- separator line.');
    }
    if (targets.length === 0) {
      throw new ToolValidationError(
        'List your target keywords below the --- separator, one per line.',
      );
    }
    const haystack = ` ${words.join(' ')} `;
    const results = targets.map((kw) => {
      const kwWords = tokenize(kw);
      const phrase = kwWords.join(' ');
      let count = 0;
      if (phrase) {
        let pos = 0;
        for (;;) {
          const i = haystack.indexOf(` ${phrase} `, pos);
          if (i < 0) break;
          count++;
          pos = i + 1;
        }
      }
      return {
        keyword: kw,
        count,
        density: round2(((count * Math.max(kwWords.length, 1)) / words.length) * 100),
      };
    });
    return { mode: 'targeted', totalWords: words.length, targets: results };
  }

  // Full mode: n-gram frequency analysis of the whole text.
  const words = tokenize(input);
  if (words.length === 0) {
    throw new ToolValidationError(
      'Paste some text to analyse. Tip: add a --- line followed by target keywords (one per line) to check specific keywords instead.',
    );
  }
  const ngrams = (n: number) => {
    const counts = new Map<string, number>();
    for (let i = 0; i + n <= words.length; i++) {
      const g = words.slice(i, i + n).join(' ');
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([term, count]) => ({
        term,
        count,
        density: round2(((count * n) / words.length) * 100),
      }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  };
  return {
    mode: 'full',
    totalWords: words.length,
    uniqueWords: new Set(words).size,
    topWords: ngrams(1).slice(0, 15),
    topPhrases: ngrams(2).slice(0, 10),
    topTrigrams: ngrams(3).slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// contrast-checker (WCAG 2.x)
// ---------------------------------------------------------------------------

function normalizeHex(raw: string): string {
  let h = raw.replace('#', '').toUpperCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastChecker(rawInput: string) {
  const matches =
    String(rawInput ?? '').match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) ?? [];
  const colors = [...new Set(matches.map(normalizeHex))];
  if (colors.length < 2) {
    throw new ToolValidationError(
      'Paste two hex colors, e.g. #1A1A1A and #FFFFFF. The first color found is treated as the foreground (text), the second as the background.',
    );
  }
  const [foreground, background] = colors;
  const lf = relativeLuminance(hexToRgb(foreground));
  const lb = relativeLuminance(hexToRgb(background));
  const ratio = round2((Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05));
  const verdict = (pass: boolean) => (pass ? 'Pass' : 'Fail');
  return {
    foreground,
    background,
    ratio,
    aaNormalText: verdict(ratio >= 4.5),
    aaLargeText: verdict(ratio >= 3),
    aaaNormalText: verdict(ratio >= 7),
    aaaLargeText: verdict(ratio >= 4.5),
  };
}

// ---------------------------------------------------------------------------
// keyword-clustering
// ---------------------------------------------------------------------------

/** Very small stemmer: normalises simple English plurals for token matching. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function keywordClustering(rawInput: string) {
  const lines = String(rawInput ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe case-insensitively, keeping the first-seen casing.
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      keywords.push(line);
    }
  }
  if (keywords.length === 0) {
    throw new ToolValidationError('Paste keywords, one per line.');
  }

  const tokensOf = (kw: string) => [...new Set(tokenize(kw).map(stem))];
  const tokenFreq = new Map<string, number>();
  for (const kw of keywords) {
    for (const t of tokensOf(kw)) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }
  const significant = new Set(
    [...tokenFreq.entries()].filter(([, c]) => c >= 2).map(([t]) => t),
  );

  // Union-find: two keywords are clustered when they share a significant token.
  const parent = keywords.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const firstByToken = new Map<string, number>();
  keywords.forEach((kw, i) => {
    for (const t of tokensOf(kw)) {
      if (!significant.has(t)) continue;
      const first = firstByToken.get(t);
      if (first === undefined) firstByToken.set(t, i);
      else {
        const a = find(first);
        const b = find(i);
        if (a !== b) parent[a] = b;
      }
    }
  });

  const groups = new Map<number, number[]>();
  keywords.forEach((kw, i) => {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  });

  const clusters: { name: string; count: number; keywords: string[] }[] = [];
  const singles: string[] = [];
  for (const idxs of groups.values()) {
    const members = idxs.map((i) => keywords[i]);
    if (members.length === 1) {
      singles.push(members[0]);
      continue;
    }
    // Cluster name = most frequent significant token(s) inside the cluster.
    const inCluster = new Map<string, number>();
    for (const m of members) {
      for (const t of tokensOf(m)) {
        if (significant.has(t)) inCluster.set(t, (inCluster.get(t) ?? 0) + 1);
      }
    }
    const ranked = [...inCluster.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const topCount = ranked.length ? ranked[0][1] : 0;
    const name =
      ranked
        .filter(([, c]) => c === topCount)
        .map(([t]) => t)
        .join(' + ') || 'Cluster';
    clusters.push({ name, count: members.length, keywords: members });
  }
  clusters.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (singles.length > 0) {
    clusters.push({ name: 'Single keywords', count: singles.length, keywords: singles });
  }
  return { totalKeywords: keywords.length, clusters };
}

// ---------------------------------------------------------------------------
// title-ab
// ---------------------------------------------------------------------------

const CLAUSE_SEPARATORS = [' — ', ' – ', ' | ', ', ', ' - '];

function splitClauses(title: string): { parts: string[]; sep: string } | null {
  for (const sep of CLAUSE_SEPARATORS) {
    if (title.includes(sep)) {
      const parts = title
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2) return { parts, sep };
    }
  }
  return null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function titleAb(rawInput: string) {
  const lines = String(rawInput ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new ToolValidationError(
      'Paste a title on the first line. Add keywords on the following lines (optional) to sharpen the variants.',
    );
  }
  const title = lines[0];
  const keywords = lines.slice(1);

  // Keyword front-loaded (or: last clause moved to the front).
  let frontLoaded = title;
  if (keywords.length > 0) {
    frontLoaded = title.toLowerCase().startsWith(keywords[0].toLowerCase())
      ? title
      : `${cap(keywords[0])}: ${title}`;
  } else {
    const clauses = splitClauses(title);
    if (clauses) {
      const { parts, sep } = clauses;
      frontLoaded = [parts[parts.length - 1], ...parts.slice(0, -1)].join(sep);
    }
  }

  // Clause-reordered (clauses reversed; word-block move as a fallback).
  let reordered = title;
  const clauses = splitClauses(title);
  if (clauses) {
    reordered = [...clauses.parts].reverse().join(clauses.sep);
  } else {
    const words = title.split(/\s+/);
    if (words.length >= 4) {
      reordered = [...words.slice(2), ...words.slice(0, 2)].join(' ');
    }
  }

  // Descriptor added from the keywords (deterministic fallback otherwise).
  const descriptor = keywords[1] ?? keywords[0];
  const withDescriptor = descriptor
    ? `${title} — ${cap(descriptor)}`
    : `${title} — Complete Guide`;

  // Shortened to 200 characters at a word boundary.
  let shortened = title;
  if (title.length > 200) {
    const cut = title.slice(0, 200);
    const lastSpace = cut.lastIndexOf(' ');
    shortened = `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }

  const variants = [
    { label: 'Original', title },
    { label: 'Keyword front-loaded', title: frontLoaded },
    { label: 'Clause reordered', title: reordered },
    { label: 'Descriptor added', title: withDescriptor },
    { label: 'Shortened (200 chars)', title: shortened },
  ].map((v) => ({ ...v, characters: v.title.length }));

  return { title, keywords, variants };
}

// ---------------------------------------------------------------------------
// batch-export
// ---------------------------------------------------------------------------

/** Minimal quote-aware CSV line parser. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function batchExport(rawInput: string) {
  const lines = String(rawInput ?? '').split(/\r?\n/);
  const rows: { title: string; description: string; keywords: string }[] = [];
  let skipped = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let title = '';
    let description = '';
    let keywords = '';
    if (line.includes('|')) {
      const parts = line.split('|').map((s) => s.trim());
      title = parts[0] ?? '';
      description = parts[1] ?? '';
      keywords = parts.slice(2).join(', ');
    } else {
      const fields = parseCsvLine(line);
      title = fields[0] ?? '';
      description = fields[1] ?? '';
      keywords = fields.slice(2).join(', ');
    }
    if (!title) {
      skipped++;
      continue;
    }
    rows.push({ title, description, keywords });
  }
  if (rows.length === 0) {
    throw new ToolValidationError(
      'No valid rows found. Use one row per line in the format: Title | Description | keyword1, keyword2 (plain CSV lines also work).',
    );
  }
  const csv = [
    'Title,Description,Keywords',
    ...rows.map((r) => [r.title, r.description, r.keywords].map(csvField).join(',')),
  ].join('\n');
  return { format: 'csv', rows: rows.length, skipped, csv };
}
