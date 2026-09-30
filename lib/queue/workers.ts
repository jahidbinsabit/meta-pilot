import { Worker } from 'bullmq';
import { connection } from '@/lib/queue/client';
import { prisma } from '@/lib/db';
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';
import { ImagePromptSchema } from '@/lib/ai/schemas';
import { deductCredits, addCredits } from '@/lib/credits/engine';
import { metadataQueue, imagePromptQueue, analyticsQueue } from '@/lib/queue/client';

// ---------------------------------------------------------------------------
// Metadata worker
// ---------------------------------------------------------------------------

async function handleMetadata(job: any) {
  const { userId, prompt, titleLength, keywordCount, prefix, suffix, negativeWords, altText } =
    job.data;
  const cost = 1;
  const deduction = await deductCredits(userId, cost, 'SPEND', {
    prompt: prompt.slice(0, 120),
    toolSlug: 'metadata-generator',
  });
  if (!deduction.ok) {
    throw new Error(`insufficient_credits: balance=${deduction.balance}`);
  }

  const systemPrompt = `You are an SEO metadata expert for stock photo agencies (Adobe Stock, Shutterstock, Vecteezy). Write metadata that maximizes discoverability.`;
  const userPrompt = `Image description: ${prompt}\n\nProduce JSON with keys: title (string, ${titleLength} chars max), description (string, 150-250 chars), keywords (array of ${keywordCount} strings), altText (string, optional). ${prefix ? "Include a prefix like 'Professional ' or 'High quality ' on the title." : ''} ${suffix ? 'Include a descriptive suffix on the title.' : ''} ${negativeWords ? "Exclude generic or banned words like 'blurry', 'low quality', 'bad'." : ''} ${altText ? 'Also write an altText field.' : 'Skip altText.'}`;

  const ai = await generateWithAI({
    toolSlug: 'metadata-generator',
    systemPrompt,
    userPrompt,
    responseSchema: MetadataSchema,
    responseSchemaName: 'Metadata',
    maxTokens: 2048,
    temperature: 0.7,
  });

  let parsed: any = ai.parsed as any;
  if (!parsed) {
    parsed = {
      title: ai.raw.slice(0, titleLength),
      description: ai.raw.slice(0, 200),
      keywords: [],
      altText: '',
    };
  }

  const record = await prisma.generatedMetadata.create({
    data: {
      userId,
      provider: ai.provider,
      model: ai.model,
      originalUrl: '',
      originalName: prompt.slice(0, 120),
      title: parsed.title || '',
      description: parsed.description || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      altText: parsed.altText || '',
      metadataJson: parsed,
      promptUsed: prompt,
      tokensUsed: ai.usage.totalTokens,
      costCents: cost,
      status: 'COMPLETED',
    },
  });

  return { ...parsed, id: record.id, balance: deduction.balance };
}

// ---------------------------------------------------------------------------
// Image-to-prompt worker
// ---------------------------------------------------------------------------

async function handleImagePrompt(job: any) {
  const { userId, image, mimeType, style } = job.data;
  const cost = 1;
  const deduction = await deductCredits(userId, cost, 'SPEND', { 
    style,
    toolSlug: 'image-to-prompt',
  });
  if (!deduction.ok) {
    throw new Error(`insufficient_credits: balance=${deduction.balance}`);
  }

  const systemPrompt = 'You analyze images and produce detailed AI image-generation prompts.';
  const userPrompt = `Analyze this image and produce a detailed prompt for generating a similar image in the ${style} style. Return JSON with keys: prompt (string), tags (array of strings), composition (string), lighting (string), mood (string).`;

  const ai = await generateWithAI({
    toolSlug: 'image-to-prompt',
    systemPrompt,
    userPrompt,
    imageUrls: [`data:${mimeType};base64,${image}`],
    responseSchema: ImagePromptSchema,
    responseSchemaName: 'ImagePrompt',
    maxTokens: 1024,
    temperature: 0.7,
  });

  let parsed: any = ai.parsed as any;
  if (!parsed) {
    parsed = { prompt: ai.raw, tags: [], composition: '', lighting: '', mood: '' };
  }

  await prisma.generatedMetadata.create({
    data: {
      userId,
      provider: ai.provider,
      model: ai.model,
      originalUrl: '',
      originalName: 'image-to-prompt',
      title: parsed.prompt?.slice(0, 120) || '',
      description: parsed.composition || '',
      keywords: Array.isArray(parsed.tags) ? parsed.tags : [],
      altText: parsed.mood || '',
      metadataJson: parsed,
      promptUsed: style,
      tokensUsed: ai.usage.totalTokens,
      costCents: cost,
      status: 'COMPLETED',
    },
  });

  return { ...parsed, balance: deduction.balance };
}

// ---------------------------------------------------------------------------
// Adobe analytics worker
// ---------------------------------------------------------------------------

async function handleAnalytics(job: any) {
  const { userId, queryType, queryValue } = job.data;

  // Adobe Stock Market Insights is not publicly exposed via a documented API
  // for this project. The worker returns realistic, curated sample data so the
  // analytics UI is functional out of the box. Swap this body for a real Adobe
  // API call when credentials are available.
  const result = {
    queryType,
    queryValue,
    generatedAt: new Date().toISOString(),
    demandScore: Math.round(60 + Math.random() * 35),
    competitionLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    topContributors: [
      { name: 'contributor_a', uploads: 120, avgPrice: 12 },
      { name: 'contributor_b', uploads: 84, avgPrice: 9 },
      { name: 'contributor_c', uploads: 57, avgPrice: 15 },
    ],
    relatedKeywords: [
      queryValue,
      `${queryValue} background`,
      `${queryValue} texture`,
      `${queryValue} vector`,
    ],
    seasonalTrend: {
      spring: 0.2,
      summer: 0.5,
      autumn: 0.3,
      winter: 0.1,
    },
    note: 'Simulated data — connect a real Adobe Analytics API key to replace this.',
  };

  await prisma.adobeAnalyticsQuery.create({
    data: { userId, queryType, queryValue, resultData: result },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

let workers: Worker[] = [];

export function startWorkers() {
  workers = [
    new Worker('metadata', handleMetadata, { connection, concurrency: 2 }),
    new Worker('image-prompt', handleImagePrompt, { connection, concurrency: 2 }),
    new Worker('analytics', handleAnalytics, { connection, concurrency: 4 }),
  ];

  for (const w of workers) {
    w.on('completed', (job) => console.log(`[queue] ${job?.name} #${job?.id} completed`));
    w.on('failed', (job, err) =>
      // BullMQ passes an undefined job when the failure happened before the
      // job could be created, so guard both fields.
      console.error(`[queue] ${job?.name} #${job?.id} failed`, err),
    );
  }

  return workers;
}

export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
}
