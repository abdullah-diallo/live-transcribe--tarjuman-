#!/usr/bin/env bash
# Deploy to Fly.io. Wraps the build args so you don't have to paste a
# 400-character single-line command — just run `./deploy.sh` (or `bash deploy.sh`).
set -euo pipefail

APP="${FLY_APP:-livetranscribe}"

CONVEX_URL="https://ardent-mockingbird-866.convex.cloud"
CONVEX_SITE_URL="https://ardent-mockingbird-866.convex.site"
SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-none}"
APP_URL="https://${APP}.fly.dev"

echo "Deploying to Fly app: $APP"
echo "Convex URL:      $CONVEX_URL"
echo "Convex site URL: $CONVEX_SITE_URL"
echo "Sentry DSN:      $SENTRY_DSN"
echo "App URL:         $APP_URL"
echo ""

fly deploy -a "$APP" \
  --build-arg "NEXT_PUBLIC_CONVEX_URL=$CONVEX_URL" \
  --build-arg "NEXT_PUBLIC_CONVEX_SITE_URL=$CONVEX_SITE_URL" \
  --build-arg "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN" \
  --build-arg "NEXT_PUBLIC_APP_URL=$APP_URL"
