# StockForge AI

AI metadata generator for stock-content creators. Generates SEO titles,
descriptions, keywords, and image-generation prompts, with an admin-configurable
AI provider layer that can switch tools between Gemini and OpenAI with zero
code deploys.

**✨ New: Automatic Provider Fallback** - If the primary AI provider (Gemini) encounters
errors like 503, rate limits, or timeouts, the system automatically falls back to the
secondary provider (OpenAI), ensuring uninterrupted service.

## Local setup

```bash
# 1. Install deps
npm install

# 2. Copy the env file and fill in secrets
cp .env.example .env

# 3. Start Postgres, Redis, and MinIO (local S3)
docker compose up -d db redis minio

# 4. Create the S3 bucket in MinIO
# Open http://localhost:9001 (login: minioadmin / minioadmin123)
# Go to Buckets → Create Bucket → Name: "stockforge-ai" → Create
# OR use the MinIO client:
docker run --rm --network host minio/mc \
  mc alias set local http://localhost:9000 minioadmin minioadmin123 && \
  mc mb local/stockforge-ai

# 5. Push the schema and seed it
npx prisma db push
npm run db:seed

# 6. Run the dev server
npm run dev
```

Open http://localhost:3000 and sign up. The first user to sign up is not
automatically an admin — see **Promoting an admin** below.

## Environment variables

| Variable             | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string (`postgresql://user:pass@host:port/db`)            |
| `NEXTAUTH_SECRET`    | 64-char random secret for NextAuth sessions                                     |
| `NEXTAUTH_URL`       | Public base URL (e.g. `http://localhost:3000`)                                  |
| `GEMINI_API_KEY`     | Gemini API key, encrypted at rest in `AiProviderConfig`                         |
| `OPENAI_API_KEY`     | OpenAI API key, encrypted at rest in `AiProviderConfig`                         |
| `GEMINI_MODEL`       | Default Gemini model (e.g. `gemini-1.5-flash`)                                  |
| `OPENAI_MODEL`       | Default OpenAI model (e.g. `gpt-4o-mini`)                                       |
| `ACTIVE_AI_PROVIDER` | Fallback provider when the DB has no enabled row                                |
| `SECRET_KEY`         | AES-256-GCM key for encrypting secrets at rest. Falls back to `NEXTAUTH_SECRET` |

## Running migrations / seed

```bash
# Apply a new migration
npx prisma migrate deploy

# Push schema changes without a formal migration
npx prisma db push

# Re-seed the database (idempotent upserts)
npm run db:seed
```

## Tests

```bash
npm test          # vitest unit tests
npm run test:e2e  # Playwright (requires the dev server running)
```

## Promoting an admin

The first signup is **not** an admin by default. Promote a user from the
command line:

```bash
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.update({where:{email:'you@example.com'},data:{role:'ADMIN'}}).then(()=>p.\$disconnect());
"
```

You can also manage roles from the Admin → Users panel once at least one admin
exists.

## AI provider abstraction with automatic fallback

The single entry point is `generateWithAI({ toolSlug, systemPrompt, userPrompt,
imageUrls, responseSchema })` in `lib/ai/router.ts`. It:

- **Automatic Fallback**: If the primary provider fails with retryable errors (503,
  rate limit, timeout, high demand), it automatically switches to the fallback provider
  (Gemini ↔ OpenAI). This ensures continuous service even during provider outages.
- Looks up `AiProviderConfig` for the given `toolSlug` at **call time** (the
  admin's per-tool routing map in `isActiveForToolSlug`), so switching a tool
  between Gemini and OpenAI takes effect on the very next generation — no
  deploy.
- Routes to `GeminiAdapter` or `OpenAiAdapter` behind the common `AiAdapter`
  interface.
- Enforces structured output: Gemini uses `response_schema` + JSON mode;
  OpenAI uses `response_format: json_schema`. Responses are parsed and
  validated with Zod; a schema mismatch is logged as `parsedOk=false` and
  returned as `parsed: null` — never thrown, so callers can refund cleanly.
- Logs every call's latency, token usage, and success/failure to
  `AiCallLog`, powering the admin's "test provider" and error-rate KPIs.
- Never hardcodes API keys: the key is pulled from the encrypted
  `AiProviderConfig.apiKeyEncrypted` and decrypted server-side only.

### Migrating a caller to `generateWithAI`

Old shape (`generateAi` from `@/lib/ai/provider`) is kept for backwards
compatibility. New callers should import `generateWithAI` and pass a Zod
`responseSchema` from `lib/ai/schemas.ts`:

```ts
import { generateWithAI } from '@/lib/ai';
import { MetadataSchema } from '@/lib/ai/schemas';

const ai = await generateWithAI({
  toolSlug: 'metadata-generator',
  systemPrompt,
  userPrompt,
  responseSchema: MetadataSchema,
  responseSchemaName: 'Metadata',
});
// ai.parsed is typed as z.infer<typeof MetadataSchema> | null
```

See `app/api/generate/metadata/route.ts`, `app/api/generate/batch/route.ts`,
`app/api/generate/image-prompt/route.ts`, `app/api/tools/run/route.ts`, and
`lib/queue/workers.ts` for migrated call sites.
