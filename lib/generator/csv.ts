import type { TargetPlatform } from '@/lib/generator/types';

/**
 * CSV export schemas for stock agencies.
 *
 * Supported formats:
 * - Adobe Stock
 * - Shutterstock
 * - Freepik
 * - Vecteezy
 * - iStock / Getty
 * - Generic
 */

export type ExportFormat = TargetPlatform;

export interface CsvRow {
  fileName: string;
  title: string;
  description: string;
  keywords: string[];
  category?: string;
  releases?: string;
}

const ADOBE_HEADERS = [
  'Filename',
  'Title',
  'Keywords',
  'Category',
  'Subcategory',
  'Description',
  'Artist Name',
  'Artist Email',
  'Image Type',
  'File Size',
  'Color',
  'Aspect Ratio',
  'Orientation',
  'Releases',
  'Model Releases',
  'Property Releases',
  'Release Forms',
  'Submission Type',
  'Custom Attribute 1',
  'Custom Attribute 2',
  'Custom Attribute 3',
  'Custom Attribute 4',
  'Custom Attribute 5',
  'Custom Attribute 6',
  'Custom Attribute 7',
  'Custom Attribute 8',
  'Custom Attribute 9',
  'Custom Attribute 10',
  'Custom Attribute 11',
  'Custom Attribute 12',
  'Custom Attribute 13',
  'Custom Attribute 14',
  'Custom Attribute 15',
  'Custom Attribute 16',
  'Custom Attribute 17',
  'Custom Attribute 18',
  'Custom Attribute 19',
  'Custom Attribute 20',
  'Custom Attribute 21',
  'Custom Attribute 22',
  'Custom Attribute 23',
  'Custom Attribute 24',
  'Custom Attribute 25',
  'Custom Attribute 26',
  'Custom Attribute 27',
  'Custom Attribute 28',
  'Custom Attribute 29',
  'Custom Attribute 30',
  'Custom Attribute 31',
  'Custom Attribute 32',
  'Custom Attribute 33',
  'Custom Attribute 34',
  'Custom Attribute 35',
  'Custom Attribute 36',
  'Custom Attribute 37',
  'Custom Attribute 38',
  'Custom Attribute 39',
  'Custom Attribute 40',
  'Custom Attribute 41',
  'Custom Attribute 42',
  'Custom Attribute 43',
  'Custom Attribute 44',
  'Custom Attribute 45',
  'Custom Attribute 46',
  'Custom Attribute 47',
  'Custom Attribute 48',
  'Custom Attribute 49',
  'Custom Attribute 50',
];

const SHUTTERSTOCK_HEADERS = [
  'Media File',
  'Title',
  'Description',
  'Keywords',
  'Category',
  'Subcategory',
  'Submission Type',
  'Image ID',
  'Referral URL',
  'Artist Name',
  'Artist Email',
  'Artist Bio',
  'Artist City',
  'Artist State',
  'Artist Country',
  'Model Releases',
  'Property Releases',
  'Release Forms',
];

const FREEPIK_HEADERS = ['Filename', 'Title', 'Keywords', 'Category'];

const VECTEEZY_HEADERS = ['Filename', 'Title', 'Description', 'Keywords', 'License'];

const ISTOCK_HEADERS = ['Filename', 'Title', 'Description', 'Keywords'];

const GENERIC_HEADERS = ['Filename', 'Title', 'Description', 'Keywords', 'Category'];

const HEADERS: Record<ExportFormat, string[]> = {
  adobe: ADOBE_HEADERS,
  shutterstock: SHUTTERSTOCK_HEADERS,
  freepik: FREEPIK_HEADERS,
  vecteezy: VECTEEZY_HEADERS,
  istock: ISTOCK_HEADERS,
  generic: GENERIC_HEADERS,
};

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(format: ExportFormat, rows: CsvRow[]): string {
  const headers = HEADERS[format];
  const lines: string[] = [headers.map(csvEscape).join(',')];

  for (const r of rows) {
    const out: Record<string, string> = {};
    if (format === 'adobe') {
      out.Filename = r.fileName;
      out.Title = r.title;
      out.Keywords = (r.keywords || []).join(', ');
      out.Category = r.category || '';
      out.Subcategory = '';
      out.Description = r.description;
      out['Artist Name'] = '';
      out['Artist Email'] = '';
      out['Image Type'] = '';
      out['File Size'] = '';
      out.Color = '';
      out['Aspect Ratio'] = '';
      out.Orientation = '';
      out.Releases = r.releases || '';
      out['Model Releases'] = r.releases || '';
      out['Property Releases'] = r.releases || '';
      out['Release Forms'] = r.releases || '';
      out['Submission Type'] = '';
      for (let i = 1; i <= 50; i++) out[`Custom Attribute ${i}`] = '';
    } else if (format === 'shutterstock') {
      out['Media File'] = r.fileName;
      out.Title = r.title;
      out.Description = r.description;
      out.Keywords = (r.keywords || []).join(', ');
      out.Category = r.category || '';
      out.Subcategory = '';
      out['Submission Type'] = '';
      out['Image ID'] = '';
      out['Referral URL'] = '';
      out['Artist Name'] = '';
      out['Artist Email'] = '';
      out['Artist Bio'] = '';
      out['Artist City'] = '';
      out['Artist State'] = '';
      out['Artist Country'] = '';
      out['Model Releases'] = r.releases || '';
      out['Property Releases'] = r.releases || '';
      out['Release Forms'] = r.releases || '';
    } else if (format === 'freepik') {
      out.Filename = r.fileName;
      out.Title = r.title;
      out.Keywords = (r.keywords || []).join(', ');
      out.Category = r.category || '';
    } else if (format === 'vecteezy') {
      out.Filename = r.fileName;
      out.Title = r.title;
      out.Description = r.description;
      out.Keywords = (r.keywords || []).join(', ');
      out.License = 'Commercial';
    } else if (format === 'istock') {
      out.Filename = r.fileName;
      out.Title = r.title;
      out.Description = r.description;
      out.Keywords = (r.keywords || []).join(', ');
    } else {
      out.Filename = r.fileName;
      out.Title = r.title;
      out.Description = r.description;
      out.Keywords = (r.keywords || []).join(', ');
      out.Category = r.category || '';
    }
    lines.push(headers.map((h) => csvEscape(out[h] ?? '')).join(','));
  }

  // Prepend BOM so Excel/Adobe uploader parse UTF-8 correctly.
  return '﻿' + lines.join('\r\n');
}

export function csvFilename(format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `metadata-export-${stamp}-${format}.csv`;
}

export function formatLabel(format: ExportFormat): string {
  switch (format) {
    case 'adobe':
      return 'Export for Adobe Stock';
    case 'shutterstock':
      return 'Export for Shutterstock';
    case 'freepik':
      return 'Export for Freepik';
    case 'vecteezy':
      return 'Export for Vecteezy';
    case 'istock':
      return 'Export for iStock / Getty';
    default:
      return 'Generic CSV';
  }
}

export function adobeRequiredColumns(): string[] {
  return ['Filename', 'Title', 'Keywords', 'Category', 'Releases'];
}

export function shutterstockRequiredColumns(): string[] {
  return ['Media File', 'Title', 'Description', 'Keywords', 'Category', 'Submission Type'];
}
