export interface GeneratorSettings {
  titleLength: number;
  titleMin: number;
  titleMax: number;
  descriptionLength: number;
  includeDescription?: boolean;
  keywordsCount: number;
  keywordsMin: number;
  keywordsMax: number;
  prefix: string;
  suffix: string;
  negativeTitleWords: string[];
  negativeKeywords: string[];
  defaultPrefix: string;
  defaultSuffix: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string; // MIME
  dataUrl: string; // object URL / base64 preview
  status: 'queued' | 'analyzing' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
  key?: string; // S3 object key once uploaded
  previewUrl?: string; // server preview URL for AI vision
  mimeType?: string; // content type of the stored preview
  previewWidth?: number;
  previewHeight?: number;
}

export type TargetPlatform =
  | 'adobe'
  | 'shutterstock'
  | 'freepik'
  | 'vecteezy'
  | 'istock'
  | 'generic';

export interface GeneratedRow {
  id: string;
  fileName: string;
  title: string;
  description: string;
  keywords: string[];
  altText: string;
  provider: string;
  model: string;
  tokensUsed: number;
  status: 'complete' | 'failed';
  error?: string;
  platform?: TargetPlatform;
}

export type ExportTarget = TargetPlatform;

export type ExportFormat = TargetPlatform;

export interface PlatformLimits {
  titleMin: number;
  titleMax: number;
  recommendedTitleLength: number;
  keywordsMin: number;
  keywordsMax: number;
  recommendedKeywordsCount: number;
}

export interface PlatformConfig {
  id: TargetPlatform;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  defaultTitleLength: number;
  defaultKeywordsCount: number;
  limits: PlatformLimits;
  features: string[];
  badgeVariant?: 'default' | 'secondary' | 'accent' | 'success' | 'warning' | 'info';
}

export const PLATFORMS: Record<TargetPlatform, PlatformConfig> = {
  adobe: {
    id: 'adobe',
    label: 'Adobe Stock',
    shortLabel: 'Adobe',
    tagline: 'Top 5-10 keywords prioritized for search algorithm + concise commercial title',
    description:
      "Engineered for Adobe Stock's ranking algorithm. The first 5 to 10 keywords carry the heaviest weight in search results.",
    defaultTitleLength: 70,
    defaultKeywordsCount: 35,
    limits: {
      titleMin: 20,
      titleMax: 200,
      recommendedTitleLength: 70,
      keywordsMin: 10,
      keywordsMax: 50,
      recommendedKeywordsCount: 35,
    },
    features: [
      'Strict importance ranking for first 10 keywords',
      'Concise, high-converting commercial titles',
      'No spam / no keyword stuffing',
    ],
  },
  shutterstock: {
    id: 'shutterstock',
    label: 'Shutterstock',
    shortLabel: 'Shutterstock',
    tagline: 'Descriptive full-sentence titles (5+ words) + rich 40+ keyword clusters',
    description:
      'Engineered for Shutterstock contributor guidelines. Requires descriptive full sentences with subject, context, and rich tags.',
    defaultTitleLength: 100,
    defaultKeywordsCount: 45,
    limits: {
      titleMin: 25,
      titleMax: 200,
      recommendedTitleLength: 100,
      keywordsMin: 15,
      keywordsMax: 50,
      recommendedKeywordsCount: 45,
    },
    features: [
      'Descriptive full-sentence captions (who/what/where/action)',
      'Rich 40-50 keyword clusters',
      'Detailed descriptions for contributor submission',
    ],
  },
  freepik: {
    id: 'freepik',
    label: 'Freepik',
    shortLabel: 'Freepik',
    tagline: 'Commercial style descriptors (vector, 3D, minimal) + high-intent search tags',
    description:
      'Optimized for Freepik assets. Targets design style, color themes, and high-demand commercial use-cases.',
    defaultTitleLength: 65,
    defaultKeywordsCount: 30,
    limits: {
      titleMin: 15,
      titleMax: 100,
      recommendedTitleLength: 65,
      keywordsMin: 10,
      keywordsMax: 50,
      recommendedKeywordsCount: 30,
    },
    features: [
      'Commercial design & style tags (vector, 3D, icon, background)',
      'Clean lowercase search tags',
      'Clear, catchy commercial titles',
    ],
  },
  vecteezy: {
    id: 'vecteezy',
    label: 'Vecteezy',
    shortLabel: 'Vecteezy',
    tagline: 'Short focused titles + vector & graphic asset tags',
    description:
      'Engineered for Vecteezy contributor submissions. Focused titles and relevant graphic/vector keywords.',
    defaultTitleLength: 60,
    defaultKeywordsCount: 30,
    limits: {
      titleMin: 15,
      titleMax: 100,
      recommendedTitleLength: 60,
      keywordsMin: 10,
      keywordsMax: 50,
      recommendedKeywordsCount: 30,
    },
    features: [
      'Focused titles within character limits',
      'High-relevance vector and graphic tags',
      'Commercial license compatible',
    ],
  },
  istock: {
    id: 'istock',
    label: 'iStock / Getty',
    shortLabel: 'iStock',
    tagline: 'Concept-rich vocabulary + clean editorial & commercial titles',
    description:
      'Optimized for Getty Images / iStock contributor indexing. Emphasizes conceptual depth and subject attributes.',
    defaultTitleLength: 80,
    defaultKeywordsCount: 35,
    limits: {
      titleMin: 20,
      titleMax: 150,
      recommendedTitleLength: 80,
      keywordsMin: 10,
      keywordsMax: 50,
      recommendedKeywordsCount: 35,
    },
    features: [
      'Conceptual and emotional tags',
      'Standardized stock vocabulary',
      'Clean editorial/commercial titles',
    ],
  },
  generic: {
    id: 'generic',
    label: 'Universal / All Agencies',
    shortLabel: 'Universal',
    tagline: 'Balanced metadata compatible across all microstock agencies',
    description:
      'Balanced titles and keywords that comply with all major stock agency guidelines simultaneously.',
    defaultTitleLength: 70,
    defaultKeywordsCount: 30,
    limits: {
      titleMin: 15,
      titleMax: 200,
      recommendedTitleLength: 70,
      keywordsMin: 10,
      keywordsMax: 50,
      recommendedKeywordsCount: 30,
    },
    features: [
      'Universal stock agency compatibility',
      'Balanced length & keyword density',
      'Standard microstock CSV export',
    ],
  },
};

