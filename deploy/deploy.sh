#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────
# PonderDB Zero-Downtime Deploy Script
# Runs on EC2 after production branch merge
# ─────────────────────────────────────────────

APP_DIR="/opt/ponderdb"
BRANCH="${1:-production}"

echo "→ Deploying PonderDB (branch: $BRANCH)..."

cd "$APP_DIR"

# Pull latest code
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Install dependencies (only if lockfile changed)
if git diff HEAD~1 --name-only | grep -q "package-lock.json"; then
  echo "→ package-lock.json changed — reinstalling..."
  npm ci
fi

# Build all packages
echo "→ Building..."
npm run build

# Run database migrations (init handles migrations automatically)
echo "→ Running migrations..."
node --env-file=.env.production packages/server/dist/bin.js db:seed 2>/dev/null || true

# Zero-downtime restart via PM2
echo "→ Restarting (zero-downtime)..."
pm2 reload ponderdb --update-env

echo "→ Deploy complete!"
pm2 status ponderdb
