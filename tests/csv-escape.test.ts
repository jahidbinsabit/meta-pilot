import { describe, it, expect } from 'vitest';
import { csvEscape as csvEscapeGenerator } from '@/lib/generator/csv';
import { csvEscape as csvEscapePrompt } from '@/lib/prompt-styles/export';

/**
 * R9 S9-06: spreadsheet formula injection. Both csvEscape copies (the
 * generator export and the prompt-styles export) must neutralize a
 * leading =, +, - or @ — including after leading whitespace/tab — by
 * prefixing a single quote BEFORE the value, and must otherwise keep
 * the legacy quoting behavior byte-identical.
 */
const implementations: Array<[string, (v: unknown) => string]> = [
  ['lib/generator/csv', csvEscapeGenerator],
  ['lib/prompt-styles/export', csvEscapePrompt],
];

for (const [name, csvEscape] of implementations) {
  describe(`csvEscape (${name})`, () => {
    it('passes plain values through unchanged', () => {
      expect(csvEscape('hello')).toBe('hello');
      expect(csvEscape('')).toBe('');
      expect(csvEscape(null)).toBe('');
      expect(csvEscape(undefined)).toBe('');
      expect(csvEscape(42)).toBe('42');
    });

    it('keeps the legacy quoting behavior', () => {
      expect(csvEscape('a,b')).toBe('"a,b"');
      expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
      expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    });

    it('neutralizes leading formula characters', () => {
      expect(csvEscape('=1+1')).toBe("'=1+1");
      expect(csvEscape('+2+2')).toBe("'+2+2");
      expect(csvEscape('-5')).toBe("'-5");
      expect(csvEscape('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    });

    it('neutralizes formula characters after leading whitespace/tab', () => {
      expect(csvEscape('  =2+5')).toBe("'  =2+5");
      expect(csvEscape('\t@x')).toBe("'\t@x");
      expect(csvEscape(' - report')).toBe("' - report");
    });

    it('prefixes before quoting when the cell also needs quotes', () => {
      expect(csvEscape('=a,b')).toBe('"\'=a,b"');
      expect(csvEscape('=HYPERLINK("https://evil","x")')).toBe(
        '"\'=HYPERLINK(""https://evil"",""x"")"',
      );
    });

    it('does not touch formula characters mid-value', () => {
      expect(csvEscape('a=b')).toBe('a=b');
      expect(csvEscape('C++ course')).toBe('C++ course');
      expect(csvEscape('email@example.com')).toBe('email@example.com');
    });
  });
}
