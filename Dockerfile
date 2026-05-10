# syntax=docker/dockerfile:1.7
# Multi-stage build for LiveTranscribe.
#
# Two important constraints driving the layout:
#
# 1. We use a CUSTOM Node entrypoint (server.js — wraps Next + adds the
#    Deepgram WebSocket proxy at /api/deepgram-ws). This means the standard
#    Next.js "standalone" output mode doesn't help us; we ship the full
#    .next directory + production node_modules + our server.js.
#
# 2. NEXT_PUBLIC_* env vars are inlined into the client bundle at BUILD
#    time, not read at runtime. So we must pass them as ARGs during
#    `docker build` — Fly forwards `--build-arg` flags from `fly deploy`.
#    See DEPLOY.md for the exact command.

# ─── Stage 1: deps ─────────────────────────────────────────────────────────
# Install ALL dependencies (including dev) needed for the build.
# Using `node:20` (Debian, not slim) so build-essential / python3 are present
# for any native-module compile. Slim image lacks them and `npm ci` chokes
# on packages that fall back to source builds.
FROM node:20 AS deps
# Use `npm install` (lenient) instead of `npm ci` (strict). The remote
# Depot builder's lock-file diffing has been flaky for this project —
# the same lock that passes `npm ci --dry-run` locally fails inside
# Depot's container with spurious "Missing: ..." errors. Lenient install
# ignores those phantom mismatches and installs from package.json + lock.
# Tradeoff: non-reproducible across deploys if package.json or lock drift,
# but acceptable for MVP. Revisit when we have time to debug Depot caching.
RUN npm install -g npm@11
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# ─── Stage 2: builder ──────────────────────────────────────────────────────
# Run `npm run build` to produce the .next output.
FROM node:20 AS builder
WORKDIR /app

# Build-time public env vars. These get inlined into the client bundle.
# Pass via `fly deploy --build-arg KEY=value` (or `docker build --build-arg`).
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_CONVEX_SITE_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Disable Next telemetry in CI builds to avoid the boot-time dialog and
# spurious outbound network call.
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: runner ───────────────────────────────────────────────────────
# Production deps + build artifacts + our server entrypoint. Same Debian
# base as builder so production-only `npm ci --omit=dev` doesn't fail on
# the same native-compile path.
FROM node:20 AS runner
WORKDIR /app

ENV NODE_ENV=production
# Fly's default internal port is 8080. server.js reads PORT.
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# Same npm-version alignment as the deps stage.
RUN npm install -g npm@11

# Production-only deps. Lenient install for the same reasons as the deps stage.
COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund && npm cache clean --force

# Build artifacts + runtime files.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Run as non-root for defence-in-depth. Node's official image ships a
# `node` user with uid 1000 already.
RUN chown -R node:node /app
USER node

EXPOSE 8080
CMD ["node", "server.js"]
