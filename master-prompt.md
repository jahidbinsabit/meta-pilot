# Master Prompt Set — AI Stock-Content Tools Platform (Next.js SaaS)

**How to use this document:** This is broken into independent, sequential prompts (PROMPT 1 → PROMPT 13). Feed them one at a time, in order, to your coding agent (Claude Code, Cursor, etc.). Each prompt is self-contained and includes exact requirements so the agent does not need to make its own product decisions. Do not skip PROMPT 1 — it sets the tech stack, folder structure, and design system every later prompt depends on.

Reference product studied: csvnest.com/app (Adobe Analytics module, Generator, All Tools grid, credits UI, sidebar navigation) and the attached screenshots (title-length slider, fixed description length, keyword-count slider, prefix/suffix/negative-word toggles).

---

## PROMPT 1 — Project Foundation, Tech Stack & Design System

You are building **[PROJECT NAME — placeholder "StockForge AI", replace before running]**, a full-stack, production-grade, multi-tenant SaaS platform for stock-content creators (Adobe Stock, Shutterstock, Vecteezy, etc.). It generates AI metadata (title/description/keywords) for images, generates prompts from images, provides Adobe Stock market analytics, and bundles a suite of creative micro-tools — all gated by a credit and membership system, with a full admin backend.

### 1.1 Tech Stack (mandatory, do not substitute)

- **Framework:** Next.js 14+ (App Router, TypeScript, Server Actions where appropriate)
- **Styling:** Tailwind CSS + shadcn/ui component primitives
- **Database:** PostgreSQL, accessed via Prisma ORM
- **Auth:** NextAuth.js (Auth.js) — Google OAuth provider + email/password fallback
- **File/image storage:** S3-compatible object storage (configurable bucket via env vars)
- **Background jobs / queues:** BullMQ + Redis (for batch metadata generation, long-running AI calls)
- **AI provider layer:** Provider-agnostic abstraction (see PROMPT 12) supporting Google Gemini and OpenAI, switchable per-tool from the admin panel
- **Payments:** Stripe (international/automated) + a custom manual-payment module for bKash/Nagad (see PROMPT 8)
- **Deployment target:** Vercel or Dockerized Node server; must run cleanly in both
- **State/data fetching:** React Query (TanStack Query) on the client; Server Components for initial loads
- **Charts:** Recharts (for Adobe Analytics and admin dashboards)
- **Testing:** Vitest + Playwright for critical flows (auth, credit deduction, payment webhook)

### 1.2 Monorepo / Folder Structure

Set up exactly this structure:

```
/app
  /(marketing)/            → homepage, pricing, about, legal pages
  /(app)/dashboard/        → logged-in tool workspace (sidebar layout)
  /(app)/dashboard/generator/
  /(app)/dashboard/image-to-prompt/
  /(app)/dashboard/adobe-analytics/
  /(app)/dashboard/tools/[tool-slug]/
  /(app)/dashboard/billing/
  /(admin)/                → separate route group, separate layout, role-gated
  /api/                    → route handlers (webhooks, AI calls, cron)
/components
  /ui/                     → shadcn primitives
  /marketing/
  /dashboard/
  /admin/
/lib
  /ai/                     → provider abstraction (PROMPT 12)
  /credits/                → credit engine (PROMPT 7)
  /payments/                → gateway abstraction (PROMPT 8)
  /db/                      → prisma client singleton
/prisma/schema.prisma
```

### 1.3 Design System (applies to every screen — marketing, dashboard, admin)

Build a **dark-mode-first, high-density SaaS dashboard aesthetic**, matching the visual language of the reference screenshots:

- **Base background:** near-black (`#0A0A0B` / `zinc-950`), card surfaces one step lighter (`zinc-900`), subtle 1px borders (`zinc-800`) — never pure black-on-black with no separation.
- **Accent color:** a single vivid accent (default electric violet `#8B5CF6` or emerald `#10B981` — pick one and use it consistently for primary buttons, active nav states, sliders, toggles). Expose the accent as a CSS variable/design token so the admin can theme it later.
- **Typography:** Inter or Geist Sans. Tight tracking on headings. Uppercase, letter-spaced, small (11–12px) labels for section headers and stat labels — mirror the "TITLE LENGTH", "OPTIONS" style labels shown in the reference screenshot.
- **Sliders:** custom-styled range sliders with a filled track up to the thumb, pill-shaped value badge on the right showing the live value (e.g., "60 chars (~10 words)") exactly as in the reference screenshot.
- **Toggles:** pill switches, off = dark gray track, on = accent color, matching the Prefix/Suffix/Negative-Words toggles shown.
- **Sidebar:** collapsible left sidebar with icon+label nav items, active item highlighted with a filled rounded rect, credits counter and progress bar pinned near the bottom above the user account chip — mirror the credits panel shown in the reference screenshot.
- **Cards/tool tiles:** the "All Tools Collection" grid uses square-ish icon tiles with a small icon, tool name, 2-column responsive grid on desktop collapsing to 1 column on mobile.
- **Motion:** use Framer Motion for page transitions, slider/toggle micro-interactions, and staged reveal of dashboard cards. Keep it subtle — 150–250ms ease-out, no bouncy overshoot on business UI (save bounce/playful easing for marketing page only).
- **Responsiveness:** every dashboard and tool screen must degrade gracefully to a single-column mobile layout with a bottom or slide-out nav; sliders and toggles must remain usable via touch.
- **Accessibility:** all interactive controls keyboard-navigable, proper ARIA labels on sliders/toggles/switches, color contrast AA-compliant against the dark background.

Do not proceed to build any feature screens until this design system (Tailwind config, CSS variables, base shadcn theme, and a shared `<AppShell>` layout with sidebar) is implemented and demonstrably reusable.

### 1.4 Environment & Config

Create a `.env.example` covering: `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `S3_*`, `REDIS_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `STRIPE_*`, `BKASH_*`, `NAGAD_*`. All provider keys must be swappable without code changes — store active provider selection in the database (admin-controlled, see PROMPT 12), not hardcoded in env.

---

## PROMPT 2 — Database Schema & Core Backend Architecture

Using Prisma, design and implement the full schema. Required models (add fields as needed, but do not omit any of these):

- **User** — id, name, email, image, googleId, passwordHash (nullable), role (`user` / `admin`), createdAt, emailVerified, status (active/suspended)
- **Membership** — userId, planId, status (active/expired/canceled), startedAt, renewsAt, cancelAtPeriodEnd
- **Plan** (admin-editable) — name (Free/Pro/Plus/Agency), monthlyPriceBDT, monthlyPriceUSD, creditsIncluded, dailyFreeCredits, adobeAnalyticsResultLimit, features (JSON: which tools unlocked), isActive, sortOrder
- **CreditWallet** — userId, balance, lastDailyGrantAt
- **CreditTransaction** — id, userId, amount (signed), type (`daily_grant`/`purchase`/`spend`/`admin_adjustment`/`refund`), relatedToolSlug, metadata (JSON), createdAt
- **CreditPackage** (admin-editable, for one-off buys) — name, credits, priceBDT, priceUSD, isActive
- **ToolJob** — id, userId, toolSlug (`metadata-generator`/`image-to-prompt`/`bg-remover`/etc.), status (queued/processing/complete/failed), inputFileUrls (JSON array), outputData (JSON), creditsCharged, aiProviderUsed, errorMessage, createdAt, completedAt
- **GeneratorSettings** — per-job snapshot of: titleLength, descriptionLength (fixed, admin-controlled default), keywordsCount, prefix, suffix, negativeTitleWords (array), negativeKeywords (array)
- **AdobeAnalyticsQuery** — userId, queryType (`keyword`/`contributor_id`), queryValue, resultData (JSON), createdAt
- **Payment** — id, userId, method (`bkash_manual`/`nagad_manual`/`stripe`/other gateway), amountBDT, amountUSD, status (pending/verified/rejected/completed), transactionRef (user-submitted trx id for manual), gatewayPayload (JSON), planIdOrCreditPackageId, reviewedByAdminId, reviewedAt
- **PaymentGatewayConfig** (admin-editable) — gatewayKey, displayName, isEnabled, isManual, credentialsJson (encrypted), sortOrder
- **AiProviderConfig** (admin-editable) — providerKey (`gemini`/`openai`), apiKeyEncrypted, isActiveForToolSlug (JSON map of tool→provider), modelName, isEnabled
- **Notification** (admin-broadcast popups) — id, title, body, ctaLabel, ctaUrl, audience (`all`/`free`/`pro`/`plus`/`agency`), startsAt, endsAt, isActive
- **HomepageContent** (admin-editable CMS blocks) — sectionKey, contentJson, isActive, sortOrder
- **AuditLog** — adminId, action, targetType, targetId, before, after, createdAt

Implement:

- Prisma migrations.
- A seed script that creates: default plans (Free/Pro/Plus/Agency with placeholder pricing), default credit packages, one admin user, default AI provider config (Gemini as default), default payment gateway rows (bKash manual, Nagad manual, Stripe — all disabled until admin adds credentials).
- Row-level guards: every query touching `ToolJob`, `Payment`, `CreditTransaction` must be scoped to the authenticated user unless called from an admin-only server action.

---

## PROMPT 3 — Authentication & Account System

Implement using NextAuth.js:

- Google OAuth login (primary, per requirement #12) — on first login, auto-create `User`, `CreditWallet` (0 balance), and a `Free` `Membership`.
- Email/password fallback registration with email verification (magic-link or OTP — your choice, but must work end-to-end).
- Session strategy: JWT, with `role` and `membershipPlan` embedded in the session token, refreshed on membership change.
- Middleware: protect all `/dashboard/*` routes (require session) and all `/admin/*` routes (require session **and** `role === 'admin'`).
- Account settings page: change name/avatar, connect/disconnect Google, view current plan, view credit balance and transaction history (paginated table), delete-account flow (soft-delete with 30-day grace period).
- On every login, run a daily-credit-grant check (see PROMPT 7) so free-tier users get their 5 daily credits without needing a cron if they're active.

---

## PROMPT 4 — Core Tool: Image → Metadata Generator (CSV Export)

This is the primary money-making feature. Build the full generator screen at `/dashboard/generator` to match the reference screenshots exactly in control behavior:

### 4.1 Upload

- Multi-file drag-and-drop + click-to-browse uploader.
- Accepted formats: **JPG, PNG, EPS, AI, SVG (vector)** — validate MIME/extension; for EPS/AI, extract a preview raster via a server-side conversion step (e.g., Ghostscript or a dedicated microservice) since these can't render natively in-browser.
- Show per-file thumbnail, filename, size, and a per-file progress/status chip (queued → analyzing → done → error).
- Batch limit configurable by admin per plan tier (e.g., Free = 3 images/batch, Pro = 25, Agency = unlimited).

### 4.2 Controls Panel (right or left rail, sticky on scroll)

Implement exactly these controls, styled per the design system in PROMPT 1:

- **Title Length** — range slider, default 60 chars, live label "`{value} chars (~{value/6} words)`", admin-configurable min/max bounds.
- **Description** — shown as a **fixed, locked** control (not editable by the user, per the reference screenshot showing a lock icon) displaying "150 chars (~25 words) (fixed)". The fixed value itself must be admin-configurable in the admin panel (so admin can globally change the fixed length), but end users cannot override it.
- **Keywords Count** — range slider, default 10, live label "`{value} keywords`", admin-configurable min/max bounds (e.g., 5–49, matching Adobe Stock's real limit).
- **Options** section (toggle switches):
  - **Prefix** — when enabled, reveals a text input; prefix text is prepended to every generated title.
  - **Suffix** — same pattern, appended to every generated title.
  - **Negative Title Words** — when enabled, reveals a tag-input where the user lists words the AI must never use in generated titles.
  - **Negative Keywords** — same pattern, for the keyword list.
- Persist the last-used settings per user (so returning users see their previous configuration pre-filled).

### 4.3 Generation Flow

- On "Generate," for each uploaded image: charge 1 credit (see PROMPT 7 for the exact deduction/refund contract), enqueue a `ToolJob`, call the AI provider abstraction (PROMPT 12) with a structured prompt that: describes the image, respects title length/keyword count/prefix/suffix/negative-word constraints, and returns **strict JSON** `{title, description, keywords: string[]}`.
- If the AI call fails or returns malformed JSON, retry once with a stricter "return JSON only" system instruction; if it still fails, mark the job failed and **auto-refund the credit** — never charge for a failed generation.
- Show live results in an editable table (title/description/keywords per row), letting the user hand-tweak any field before export.

### 4.4 CSV Export

- Export button produces a CSV matching **Adobe Stock's** bulk-CSV upload schema (columns: Filename, Title, Keywords, Category, Releases — confirm/implement the exact current Adobe Stock CSV column spec) so files can be uploaded directly with "auto fetch" filling in all details as the user described.
- Also support **Shutterstock**'s CSV schema as a selectable export format (dropdown: "Export for Adobe Stock" / "Export for Shutterstock" / "Generic CSV").
- CSV must be downloadable and also optionally emailed / saved to the user's job history.

---

## PROMPT 5 — Core Tool: Image → Prompt

Build `/dashboard/image-to-prompt`:

- Same uploader component as PROMPT 4 (reuse it), same supported formats (JPG/PNG/EPS/AI/vector).
- Single control: **Prompt Style** dropdown (e.g., "Descriptive", "Midjourney-style tags", "Stable Diffusion tags", "Cinematic") — admin-configurable list of presets, each preset mapping to a different system instruction sent to the AI provider.
- On generate: 1 credit per image, calls the AI provider abstraction requesting a detailed prompt that reconstructs the image's subject, style, lighting, composition, and mood as a single paste-ready text prompt.
- Results shown as a copy-to-clipboard card per image, plus a "copy all" and CSV/TXT export.
- Same failure → auto-refund contract as PROMPT 4.

---

## PROMPT 6 — Adobe Analytics Module

Build `/dashboard/adobe-analytics`, matching the reference screenshot's two-tab layout ("Search by Keyword" / "Search by Contributor ID"):

### 6.1 Search by Keyword

- Input field + filters: Sort By (Relevance/Newest/Downloads), Content Type (All/Photos/Vectors/Illustrations), Generative AI (All/Include AI/Exclude AI) — dropdowns styled per the reference screenshot.
- On search, return: total matching asset count, estimated download-volume trend for the keyword, top-performing assets (thumbnail, title, contributor, download count if obtainable), and a time-series chart (Recharts) of relative search/download interest.
- **Data-accuracy requirement:** the user explicitly requires this to be exact/accurate. Since Adobe Stock does not expose a public download-count API, implement this by integrating with Adobe Stock's official Search API (via Adobe's Stock API / Adobe I/O) for real asset and metadata data, and clearly label any estimated (non-Adobe-sourced) metric as "Estimated" in the UI. Do not fabricate numbers presented as exact.

### 6.2 Search by Contributor ID

- Input for a numeric Adobe Stock contributor ID.
- Return contributor's public portfolio: total assets, asset grid (thumbnail/title/type), and aggregate stats available via the official API.

### 6.3 Tier Gating (per requirement #8)

- Free tier: keyword and contributor-ID search return only the **top 20 results**, with the remainder blurred/locked behind an upgrade CTA.
- Pro/Plus/Agency: full result set, limit per tier configurable from the admin panel (see PROMPT 9).
- This module does not consume image-generation credits — gate it purely by plan tier, with the row limit itself admin-adjustable.

---

## PROMPT 7 — Credit Engine & Membership System

Implement a dedicated, well-tested credit module at `/lib/credits`:

- **Daily free credits:** every user, regardless of plan, receives `Plan.dailyFreeCredits` (default 5 for Free tier — admin can also grant daily credits to paid tiers if desired) once per rolling 24h/calendar day. Implement idempotently (check `CreditWallet.lastDailyGrantAt`) so it can't be double-granted by concurrent requests.
- **Spend:** every credit-consuming action (metadata generation, image-to-prompt) must call a single `spendCredits(userId, toolSlug, amount)` function that: checks balance atomically (DB transaction / row lock), decrements wallet, writes a `CreditTransaction` row, and throws a typed `InsufficientCreditsError` the UI catches to show an upgrade/buy-credits prompt.
- **Refund:** a matching `refundCredits(userId, toolJobId)` function used on generation failure, writing a `type: 'refund'` transaction.
- **Cost-per-action is admin-configurable:** store the credit cost per tool slug in a `ToolCreditCost` table (add this model), default 1 credit for metadata-generate and image-to-prompt, editable in admin without redeploying.
- **Credit purchase:** `/dashboard/billing` lets users buy a `CreditPackage` outright (one-time) or subscribe to a `Plan` (recurring). Show current balance, usage history chart (credits spent per day, last 30 days), and low-balance warnings.
- **Membership enforcement:** a `requirePlan(minPlan)` server-side guard for any route/feature restricted to Pro+ (e.g., unlimited Adobe Analytics results, batch size, priority queue).

---

## PROMPT 8 — Payment System (bKash/Nagad Manual + Automated + International)

Build `/lib/payments` as a **gateway-abstraction layer** so new gateways can be added without touching checkout UI:

### 8.1 Manual bKash/Nagad flow

- Checkout screen shows the admin-configured receiving number/instructions for bKash and Nagad (pulled from `PaymentGatewayConfig.credentialsJson`, which for manual gateways just stores display instructions, not secrets).
- User submits: amount paid, sender number, and the **transaction ID** they received from bKash/Nagad.
- This creates a `Payment` row with `status: pending`. It does **not** grant credits/membership immediately.
- Admin panel gets a "Pending Payments" queue (see PROMPT 9) where an admin manually verifies the transaction ID against their bKash/Nagad account and clicks Approve/Reject. Approve → atomically grants the credits/plan and sets `status: completed`; Reject → notifies user with a reason field.

### 8.2 Automated payment gateway

- Integrate a real automated bKash/Nagad merchant API (bKash "Payment Gateway"/"Tokenized Checkout" API, Nagad merchant API) as a toggleable option — when admin adds live merchant credentials and enables "Automated" for that gateway, checkout uses the redirect/callback flow instead of the manual-submission form, and webhooks auto-complete the `Payment` and grant credits/plan.
- Build the generic webhook handler at `/api/payments/webhook/[gateway]` verifying signatures per-gateway.

### 8.3 International gateway

- Integrate Stripe Checkout as the default international option (card payments), fully automated via Stripe webhooks, same `Payment`/grant contract as above.
- Design the gateway abstraction so a second international provider (e.g., Paddle/PayPal) could be dropped in later by implementing the same `PaymentGateway` interface (`createCheckoutSession`, `verifyWebhook`, `parseWebhookEvent`).

### 8.4 Admin control (cross-reference PROMPT 9)

All of the following must be toggleable/editable purely from the admin panel, no code changes: which gateways are enabled, manual vs. automated mode per gateway, receiving numbers/instructions text, currency shown, and package/plan pricing tied to each purchase.

---

## PROMPT 9 — Admin Panel (Full Backend Control)

Build `/admin` as a fully separate, role-gated layout (sidebar nav, distinct from the user dashboard shell but consistent with the same design tokens). Sections:

### 9.1 Dashboard/Overview

KPI cards: total users, active subscriptions by plan, MRR estimate, credits spent today, jobs processed today, pending manual payments count (with a red badge), AI provider error rate (last 24h).

### 9.2 Users

- Searchable/filterable table (by email, plan, status, signup date).
- Detail view per user: profile, membership history, credit wallet with manual **admin adjustment** (grant/deduct credits with a required reason, logged to `AuditLog`), job history, payment history, suspend/reactivate/delete actions.

### 9.3 Membership & Plans

- CRUD on `Plan`: name, BDT/USD pricing, included credits, daily free credits, feature flags (JSON toggles per tool), Adobe Analytics result-limit for that tier, active/inactive, reorder.
- CRUD on `CreditPackage`: name, credit amount, BDT/USD price, active/inactive.

### 9.4 Credit Settings

- Global daily free-credit amount for Free tier.
- Per-tool credit cost table (`ToolCreditCost`) — editable inline.

### 9.5 Payments

- **Pending Manual Payments queue** — table of `Payment.status = pending` rows with sender number, amount, submitted trx ID, a link/field to mark Approve or Reject (with reason). Approve triggers the grant transaction described in PROMPT 8.1.
- **Gateway configuration** — enable/disable each gateway, toggle manual/automated, edit credentials (masked in UI, encrypted at rest), edit display instructions/receiving numbers, reorder gateway list shown at checkout.
- **Transaction log** — full searchable payment history, exportable to CSV.

### 9.6 AI Provider Settings

- Table of providers (Gemini, OpenAI) with enable/disable, API key entry (masked), model name override, and a per-tool mapping ("Metadata Generator uses: Gemini / gpt-4o / etc.") — see PROMPT 12 for the runtime contract this must satisfy.
- Live test button per provider ("send test prompt, show latency and raw response") so the admin can verify a key works before switching production traffic to it.

### 9.7 Tools Management

- Enable/disable individual tools sitewide or per-plan (drives both the sidebar and the "All Tools Collection" grid on the dashboard/homepage).
- Edit each tool's icon, name, slug, short description, and sort order.
- Edit generator-specific defaults: fixed description length, title-length slider bounds, keyword-count slider bounds, default prefix/suffix state.

### 9.8 Homepage/CMS Editor

- Section-by-section editable content blocks (hero headline/subhead/CTA, features grid, tools showcase, testimonials, pricing table source-of-truth = live `Plan` data, FAQ) — stored in `HomepageContent`, rendered on the public homepage without redeploy.
- Basic SEO fields per marketing page: meta title, meta description, OG image.

### 9.9 Notifications

- CRUD on `Notification` (popup/banner): title, body, CTA, audience targeting by plan, start/end scheduling, active toggle. Render as a dismissible in-app popup/toast on the dashboard for the targeted audience.

### 9.10 Analytics Integration

- Fields to paste a Google Analytics measurement ID and a Google Search Console verification tag/meta value; when set, auto-inject the GA script and the GSC verification tag sitewide (marketing pages primarily) without further code changes.

### 9.11 Audit Log

- Read-only, filterable view of every `AuditLog` row (who changed what, before/after diff, when) — cover all admin mutations above.

---

## PROMPT 10 — Additional AI Micro-Tools Suite

Implement the remaining tools shown in the "All Tools Collection" grid as real, functional features under `/dashboard/tools/[slug]`, each consuming the admin-configured credit cost (default 1 credit unless the admin sets otherwise), each using the shared uploader/results UI patterns from PROMPT 4–5:

1. **BG Remover** — background removal (server-side model or API), returns transparent PNG.
2. **Bento Builder** — drag-and-drop grid layout tool for assembling a "bento box" style image/portfolio grid, exportable as PNG.
3. **Color Palette** — extract a dominant color palette (with hex codes) from an uploaded image.
4. **ASCII Vision** — convert an uploaded image to ASCII art, adjustable density/character-set, exportable as text or PNG.
5. **Events** — a simple content calendar for stock-content creators (seasonal shoot reminders, upload deadlines) — user-managed, not AI-driven.
6. **Adobe Keywords** — standalone keyword-suggestion tool: type a subject, get an AI-ranked keyword list sized to Adobe Stock's real limits (separate from the full metadata generator, for quick keyword-only use).
7. **AI/EPS to JPG** — server-side conversion utility (vector → raster), no AI credit cost (mark as free/utility, admin-configurable).
8. **Halftone Studio** — apply a halftone-dot filter to an image with adjustable dot size/angle, exportable PNG.
9. **Dither Studio** — apply dithering effects (Floyd–Steinberg, ordered, etc.) to an image, exportable PNG.
10. **Image to PSD** — convert a flat image into a layered PSD (background + any AI-detected subject/background split as separate layers).

Each tool tile on the "All Tools Collection" grid must link to a real, working page — no placeholder/"coming soon" tiles unless the admin explicitly disables that tool (per PROMPT 9.7), in which case the tile shows a locked state rather than a broken link.

---

## PROMPT 11 — Public Homepage & Marketing Site

Build the `(marketing)` route group as a full, conversion-oriented SaaS homepage (reference: csvnest.com's structure) with these sections, all sourced from `HomepageContent`/`Plan` where noted in PROMPT 9.8:

1. **Header** — logo, nav (Tools, Pricing, How it Works, Login/Get Started).
2. **Hero** — headline, subhead, primary CTA ("Start Free — 5 Credits Daily"), animated product screenshot/mockup of the generator.
3. **Logos/Trust bar** — "Compatible with Adobe Stock, Shutterstock, Vecteezy, Dreamstime" style strip.
4. **Feature highlights** — 3–4 cards: Metadata Generator, Image-to-Prompt, Adobe Analytics, and the micro-tools suite.
5. **All Tools showcase** — the same tool grid as the dashboard, public-facing, each linking to a tool landing anchor or the login flow.
6. **How It Works** — 3-step visual (Upload → Configure → Export CSV).
7. **Pricing table** — live-rendered from `Plan` data (Free/Pro/Plus/Agency), monthly/yearly toggle if applicable, "Buy Credits" secondary option.
8. **Testimonials** — admin-editable placeholder content.
9. **FAQ** — accordion, admin-editable.
10. **Footer** — links, legal (Terms/Privacy), social.

Requirements:

- **Google SEO:** semantic HTML, proper heading hierarchy, meta tags per page (editable per PROMPT 9.8), sitemap.xml and robots.txt auto-generated, structured data (JSON-LD `SoftwareApplication`/`Organization`) on the homepage.
- **Performance:** target Lighthouse 95+ on mobile and desktop — use `next/image` for all imagery, font subsetting, code-split the dashboard/admin bundles away from the marketing bundle, avoid render-blocking third-party scripts (lazy-load GA).
- **Mobile-first:** every section must reflow cleanly at 375px width; sticky mobile CTA bar recommended.
- **Animation:** tasteful entrance animations (Framer Motion, scroll-triggered) on hero and feature sections — keep total JS light to protect performance scores.

---

## PROMPT 12 — AI Provider Abstraction Layer

Build `/lib/ai/index.ts` exposing one function: `generateWithAI({ toolSlug, systemPrompt, userPrompt, imageUrls, responseSchema })`.

- Internally, look up `AiProviderConfig` for the given `toolSlug` (admin sets this mapping per PROMPT 9.6) to decide whether to route to Gemini or OpenAI, and with which model.
- Implement two concrete adapters (`GeminiAdapter`, `OpenAiAdapter`) behind a common `AiAdapter` interface: `generate(input): Promise<{ raw: string, parsed: T | null, usage: {...} }>`.
- Enforce structured/JSON output (Gemini: `responseSchema`/JSON mode; OpenAI: `response_format: json_schema` or tool-calling) so callers in PROMPT 4/5/10 always get typed, validated data — validate with Zod and reject/retry on schema mismatch.
- Log every call's latency, token usage, and success/failure to support the admin's "test provider" and error-rate KPI (PROMPT 9.1/9.6).
- Never hardcode API keys — always pull from the encrypted `AiProviderConfig.apiKeyEncrypted`, decrypted server-side only.
- This layer must make it possible for the admin to switch, e.g., the Image-to-Prompt tool from Gemini to OpenAI with zero code deploys.

---

## PROMPT 13 — Notifications, QA Pass & Launch Checklist

### 13.1 In-app Notification Rendering

Wire the `Notification` model (PROMPT 9.9) into the dashboard shell: on load, fetch active notifications targeted at the current user's plan and time window, render as a dismissible modal/toast (store dismissal in localStorage keyed by notification id so it doesn't reappear).

### 13.2 End-to-End QA Checklist (verify all before calling the project done)

- [ ] Signup via Google and via email both create wallet + Free plan correctly.
- [ ] Daily 5-credit grant fires exactly once per day, race-condition safe.
- [ ] Metadata generation charges credit only on success; failure auto-refunds.
- [ ] CSV export opens cleanly in Adobe Stock's bulk uploader field mapping (verify column headers against Adobe's current spec).
- [ ] Adobe Analytics free-tier correctly caps at 20 results with an upgrade prompt; paid tiers see admin-configured limits.
- [ ] Manual bKash/Nagad payment: submission → pending → admin approval → credits/plan granted atomically, user notified.
- [ ] Stripe automated payment: checkout → webhook → credits/plan granted, idempotent against webhook retries.
- [ ] Admin can change AI provider for a tool and the next generation call uses the new provider with no deploy.
- [ ] Admin can disable a tool and it disappears/locks on both dashboard and homepage.
- [ ] All dashboard and admin screens pass a manual mobile-viewport check (375px–428px).
- [ ] Lighthouse: 95+ performance, 95+ SEO, 95+ accessibility on homepage.
- [ ] Audit log captures every admin mutation listed in PROMPT 9.

Deliver a short README covering: local setup, env vars, running migrations/seed, and how to promote a user to `admin` role for first access.

---

**End of master prompt set.** Feed PROMPT 1 first and confirm the design system and folder structure are in place before proceeding to PROMPT 2, and so on sequentially. If your coding agent has a context/output limit, paste one PROMPT block per session — each is written to stand alone.
