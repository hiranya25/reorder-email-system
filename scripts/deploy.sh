#!/usr/bin/env bash
# Update the live console on cPanel: pull, build, migrate, restart.
#   ./scripts/deploy.sh
# Reads settings from ~/.reorder.env (or $REORDER_ENV_FILE). See docs/DEPLOY_CPANEL.md.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${REORDER_ENV_FILE:-$HOME/.reorder.env}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  echo "Missing $ENV_FILE (DATABASE_URL, APP_SECRET, APP_URL). See docs/DEPLOY_CPANEL.md." >&2
  exit 1
fi

echo "==> Pulling latest main"
git fetch --quiet origin main
git checkout --quiet main
git pull --ff-only --quiet origin main

echo "==> Installing dependencies"
corepack enable >/dev/null 2>&1 || true
# Build tools are dev dependencies, so install them even when NODE_ENV=production.
pnpm install --frozen-lockfile --prod=false

echo "==> Building"
NEXT_TELEMETRY_DISABLED=1 pnpm build
apps/console/scripts/prepare-standalone.sh

echo "==> Updating the database"
pnpm db:migrate

echo "==> Restarting the app"
mkdir -p apps/console/tmp
touch apps/console/tmp/restart.txt

echo "Done: $(git log -1 --format='%h %s')"
