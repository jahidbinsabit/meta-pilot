# 🚀 MetaPilot (StockForge AI)

[![Next.js 14](https://img.shields.io/badge/Next.js-14.2-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-5.14-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)

**MetaPilot** is an enterprise-grade AI metadata generation platform built specifically for stock-content creators, photographers, vector artists, and digital studios. It streamlines the creation of high-ranking SEO titles, targeted descriptions, optimized keywords, and reverse-engineered AI prompts for major stock platforms (Adobe Stock, Shutterstock, Freepik, Getty Images, etc.).

---

## ✨ Key Features

### 📸 1. AI Stock Metadata Generation
- **Batch Processing:** Upload multiple images, vectors, and illustrations simultaneously.
- **Platform-Specific Presets:** Generate customized titles and keyword tags adhering strictly to platform limits.
- **CSV & Export Ready:** Export generated metadata in CSV format formatted for direct upload to Adobe Stock and contributor portals.

### 🎨 2. Image-to-Prompt Reverse Engineering
- Transform existing images into detailed, production-ready AI image prompts (Midjourney, Stable Diffusion, DALL-E 3).
- Fine-tune prompt styles, artistic lighting, render engines, and camera angles.

### 🧠 3. Multi-AI Provider Engine with Automatic Fallback
- **Swappable Providers:** Seamlessly switch between **Google Gemini (1.5 Flash / Pro)**, **OpenAI (GPT-4o / GPT-4o-mini)**, and **Custom/Local LLMs (OmniRoute, Ollama, etc.)**.
- **Auto-Failover Resilience:** Automatically recovers from rate limits, timeouts, and API errors (503s) by falling back to secondary providers with zero downtime.
- **Zero-Code Runtime Routing:** Admins can configure and map specific AI providers per tool directly from the admin panel without redeploying code.

### 📊 4. Adobe Stock Analytics & Trend Research
- Research market demand, keyword volume, and trending categories directly within the dashboard.
- Save historical queries and analyze content competition.

### 💳 5. Credits, Subscriptions & Flexible Payments
- **Credit Engine:** Real-time credit deductions, daily free grant refreshes, and wallet balance tracking.
- **Global & Local Payment Gateways:** Stripe, bKash, and Nagad manual verification workflows.
- **Membership Tiers:** Support for Free, Pro, Plus, Agency, and Enterprise tiers with custom limits.

### 🛡️ 6. Full Admin Control & Observability
- **AI Latency & Token Analytics:** Track token usage, API latency, and parse success rates.
- **Audit Logs:** Immutable audit log for administrative actions.
- **User Management:** Granular role-based access control (`USER` / `ADMIN`), plan assignments, and credit overrides.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router, Server Actions, API Routes)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **UI & Styling:** [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Radix UI](https://www.radix-ui.com/), [Lucide Icons](https://lucide.dev/)
- **ORM & Database:** [Prisma ORM](https://www.prisma.io/) with [PostgreSQL](https://www.postgresql.org/)
- **Authentication:** [NextAuth.js](https://next-auth.js.org/) (Credentials & Google OAuth)
- **File Storage:** AWS S3 / MinIO / Cloudflare R2 Compatible Object Storage
- **Queue / Background Jobs:** [BullMQ](https://bullmq.io/) + [Redis](https://redis.io/)
- **Testing:** [Vitest](https://vitest.dev/) & [Playwright](https://playwright.dev/)


---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20.0.0`
- PostgreSQL database
- Redis (optional for development without background queues)
- Docker & Docker Compose (optional for instant local database/MinIO/Redis)

### 1. Clone the repository
```bash
git clone https://github.com/jahidbinsabit/meta-pilot.git
cd meta-pilot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables
Copy `.env.example` to `.env` and configure your keys:
```bash
cp .env.example .env
```

### 4. Start local infrastructure (Docker)
```bash
docker compose up -d db redis minio
```

### 5. Setup database and seed initial data
```bash
# Push database schema
npm run db:push

# Seed default tools, plans, styles, and gateways
npm run db:seed
```

### 6. Start the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Environment Variables Reference

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://...`) |
| `NEXTAUTH_URL` | Base URL of the app (`http://localhost:3000` or production domain) |
| `NEXTAUTH_SECRET` | 64-character random string for auth session encryption |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret (optional) |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `OPENAI_API_KEY` | OpenAI API Key |
| `S3_ENDPOINT` | S3 API endpoint URL (AWS S3, MinIO, or Cloudflare R2) |
| `S3_BUCKET` | Target bucket name |
| `S3_REGION` | AWS / S3 region (e.g., `us-east-1`) |
| `S3_ACCESS_KEY_ID` | S3 Access Key ID |
| `S3_SECRET_ACCESS_KEY` | S3 Secret Access Key |
| `REDIS_URL` | Redis connection URL (`redis://localhost:6379`) |
| `STRIPE_SECRET_KEY` | Stripe Secret Key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Publishable Key |

---

## 👑 Promoting an Admin User

Sign up for an account via `/signup`. Newly registered users have the `USER` role. To grant `ADMIN` privileges:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.update({
  where: { email: 'your-email@example.com' },
  data: { role: 'ADMIN' }
}).then(() => {
  console.log('✅ User promoted to ADMIN');
  prisma.\$disconnect();
});
"
```

Once promoted, visit `/admin` to access the administration panel.

---

## 🌐 Deploying to Vercel

1. **Push your code to GitHub:**
   ```bash
   git remote add origin https://github.com/jahidbinsabit/meta-pilot.git
   git push -u origin main
   ```
2. Open [Vercel](https://vercel.com/new) and **Import** the `meta-pilot` repository.
3. In **Project Settings → Environment Variables**, add your production variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GEMINI_API_KEY`, etc.).
4. Click **Deploy**. Vercel will build Next.js and generate the Prisma Client automatically.

---

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run end-to-end tests
npm run test:e2e
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
