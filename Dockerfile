# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# StockForge AI — multi-stage Docker build
#
# Produces a standalone Next.js bundle that runs without the full toolchain.
# Build:  docker build -t genmetaai .
# Run:    docker compose up -d
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base

WORKDIR /app

# Install libc / native deps required by Prisma's query engine on musl.
RUN apk add --no-cache libc6-compat

# 1. Dependencies — copy manifests first for layer caching.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev --legacy-peer-deps

# 2. Prisma — generate the client against the final schema.
FROM base AS prisma
COPY --from=deps /app/node_modules /app/node_modules
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npx prisma generate

# 3. Builder. NEXT_STANDALONE=1 emits a self-contained bundle in .next/standalone.
FROM base AS builder
WORKDIR /app
ARG NEXT_STANDALONE=1
ENV NEXT_STANDALONE=${NEXT_STANDALONE}
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=prisma /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=prisma /app/node_modules/.prisma /app/node_modules/.prisma
COPY . .
RUN npm run build

# 4. Runner — slim production image.
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nextjs
RUN adduser --system --uid 1001 nextjs

# Standalone output + public assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

# Prisma runtime + client (needed by server modules at runtime).
COPY --from=prisma /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]