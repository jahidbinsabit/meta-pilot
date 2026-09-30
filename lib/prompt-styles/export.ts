/**
 * CSV / TXT export for Image → Prompt results (PROMPT 5).
 * Mirrors the escaping and BOM conventions in lib/generator/csv.ts so the
 * output opens cleanly in Excel and the Adobe uploader.
 */

export interface PromptExportRow {
  fileName: string;
  styleLabel: string;
  prompt: string;
}

const CSV_HEADERS = ['File Name', 'Prompt Style', 'Prompt'];

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildPromptCsv(rows: PromptExportRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([csvEscape(r.fileName), csvEscape(r.styleLabel), csvEscape(r.prompt)].join(','));
  }
  // BOM so Excel parses UTF-8 correctly.
  return '﻿' + lines.join('\r\n');
}

export function buildPromptTxt(rows: PromptExportRow[]): string {
  return rows.map((r) => `# ${r.fileName}\n${r.prompt}`).join('\n\n');
}

export type PromptExportFormat = 'csv' | 'txt';

export function promptExportFilename(format: PromptExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `image-prompts-${stamp}.${format}`;
}

export function buildPromptExport(format: PromptExportFormat, rows: PromptExportRow[]): string {
  return format === 'csv' ? buildPromptCsv(rows) : buildPromptTxt(rows);
}
