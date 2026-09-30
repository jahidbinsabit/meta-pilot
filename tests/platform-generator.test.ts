import { describe, it, expect } from 'vitest';
import { buildMetadataPrompt, buildRetrySystemPrompt } from '@/lib/generator/prompt';
import { buildCsv, csvFilename, formatLabel } from '@/lib/generator/csv';
import { PLATFORMS, type TargetPlatform, type GeneratorSettings } from '@/lib/generator/types';

const mockSettings: GeneratorSettings = {
  titleLength: 70,
  titleMin: 20,
  titleMax: 200,
  descriptionLength: 150,
  keywordsCount: 30,
  keywordsMin: 10,
  keywordsMax: 50,
  prefix: 'AI Generated',
  suffix: 'Stock Photo',
  negativeTitleWords: ['ugly', 'blurry'],
  negativeKeywords: ['watermark', 'bad quality'],
  defaultPrefix: '',
  defaultSuffix: '',
};

describe('Multi-Platform Metadata Generator Prompts', () => {
  const platforms: TargetPlatform[] = ['adobe', 'shutterstock', 'freepik', 'vecteezy', 'istock', 'generic'];

  it.each(platforms)('builds specialized prompt for platform: %s', (platform) => {
    const { systemPrompt, userPrompt } = buildMetadataPrompt({
      settings: mockSettings,
      imageDescription: 'A serene mountain lake at sunrise with mist',
      platform,
    });

    expect(userPrompt).toContain('A serene mountain lake at sunrise with mist');
    expect(userPrompt).toContain(`Target platform: ${platform.toUpperCase()}`);
    expect(systemPrompt).toContain('characters');
    expect(systemPrompt).toContain('NEVER use these words in the title: ugly, blurry');
    expect(systemPrompt).toContain('NEVER include these keywords: watermark, bad quality');
    expect(systemPrompt).toContain('Prepend this exact prefix to the title: "AI Generated"');
    expect(systemPrompt).toContain('Append this exact suffix to the title: "Stock Photo"');
  });

  it('includes Adobe specific ranking rules in adobe platform prompt', () => {
    const { systemPrompt } = buildMetadataPrompt({
      settings: mockSettings,
      imageDescription: 'Test photo',
      platform: 'adobe',
    });
    expect(systemPrompt).toContain('CRITICAL FOR ADOBE STOCK');
    expect(systemPrompt).toContain('The first 5-10 keywords MUST be the most critical');
  });

  it('includes Shutterstock specific full-sentence rules in shutterstock prompt', () => {
    const { systemPrompt } = buildMetadataPrompt({
      settings: mockSettings,
      imageDescription: 'Test photo',
      platform: 'shutterstock',
    });
    expect(systemPrompt).toContain('Detailed descriptive sentence');
    expect(systemPrompt).toContain('Describe who/what, action, setting');
  });

  it('builds retry prompt for any platform correctly', () => {
    const retryPrompt = buildRetrySystemPrompt({
      settings: mockSettings,
      platform: 'adobe',
    });
    expect(retryPrompt).toContain('Target Platform: ADOBE');
    expect(retryPrompt).toContain('Title max 70 chars');
    expect(retryPrompt).toContain('Keywords: exactly 30 strings');
  });

  it('handles description toggle OFF correctly in prompts', () => {
    const settingsWithoutDesc: GeneratorSettings = {
      ...mockSettings,
      includeDescription: false,
    };

    const { systemPrompt } = buildMetadataPrompt({
      settings: settingsWithoutDesc,
      imageDescription: 'Test photo without description',
      platform: 'adobe',
    });

    expect(systemPrompt).toContain('Do NOT generate a description');
    expect(systemPrompt).toContain('"description": empty string ""');

    const retryPrompt = buildRetrySystemPrompt({
      settings: settingsWithoutDesc,
      platform: 'adobe',
    });

    expect(retryPrompt).toContain('Set "description" to an empty string ""');
  });
});

describe('Multi-Platform CSV Exports', () => {
  const sampleRows = [
    {
      fileName: 'photo_01.jpg',
      title: 'Majestic Mountain Sunrise, Lake Reflection',
      description: 'Stunning aerial view of sunrise over a crystal mountain lake.',
      keywords: ['mountain', 'sunrise', 'lake', 'reflection', 'nature', 'landscape'],
      category: 'Nature/Landscapes',
      releases: 'none',
    },
    {
      fileName: 'business_team.png',
      title: 'Modern Business Team Working in Office',
      description: 'Group of diverse corporate colleagues collaborating around a laptop.',
      keywords: ['business', 'teamwork', 'office', 'corporate', 'meeting', 'diversity'],
      category: 'Business',
      releases: 'Model released',
    },
  ];

  it('exports valid Adobe Stock CSV with custom attributes and category', () => {
    const csv = buildCsv('adobe', sampleRows);
    expect(csv).toContain('Filename,Title,Keywords,Category,Subcategory,Description');
    expect(csv).toContain('photo_01.jpg');
    expect(csv).toContain('"Majestic Mountain Sunrise, Lake Reflection"');
    expect(csvFilename('adobe')).toMatch(/^metadata-export-[\d-]+-adobe\.csv$/);
    expect(formatLabel('adobe')).toContain('Adobe Stock');
  });

  it('exports valid Shutterstock CSV format with comma-separated tags', () => {
    const csv = buildCsv('shutterstock', sampleRows);
    expect(csv).toContain('Media File,Title,Description,Keywords,Category');
    expect(csv).toContain('photo_01.jpg');
    expect(csvFilename('shutterstock')).toMatch(/^metadata-export-[\d-]+-shutterstock\.csv$/);
  });

  it('exports valid Freepik CSV format', () => {
    const csv = buildCsv('freepik', sampleRows);
    expect(csv).toContain('Filename,Title,Keywords,Category');
    expect(csvFilename('freepik')).toMatch(/^metadata-export-[\d-]+-freepik\.csv$/);
  });

  it('exports valid Vecteezy CSV format', () => {
    const csv = buildCsv('vecteezy', sampleRows);
    expect(csv).toContain('Filename,Title,Description,Keywords,License');
    expect(csvFilename('vecteezy')).toMatch(/^metadata-export-[\d-]+-vecteezy\.csv$/);
  });

  it('exports valid iStock / Getty CSV format', () => {
    const csv = buildCsv('istock', sampleRows);
    expect(csv).toContain('Filename,Title,Description,Keywords');
    expect(csvFilename('istock')).toMatch(/^metadata-export-[\d-]+-istock\.csv$/);
  });

  it('exports valid Generic Microstock CSV format', () => {
    const csv = buildCsv('generic', sampleRows);
    expect(csv).toContain('Filename,Title,Description,Keywords,Category');
    expect(csvFilename('generic')).toMatch(/^metadata-export-[\d-]+-generic\.csv$/);
  });
});