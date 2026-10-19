#!/usr/bin/env bash
# Copies static assets into the standalone build (Next.js leaves them out on purpose).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.next/standalone/apps/console
[ -f "$OUT/server.js" ] || { echo "Run 'pnpm build' first: $OUT/server.js not found" >&2; exit 1; }
rm -rf "$OUT/.next/static"
mkdir -p "$OUT/.next"
cp -r .next/static "$OUT/.next/static"
if [ -d public ]; then rm -rf "$OUT/public"; cp -r public "$OUT/public"; fi
echo "Standalone build ready: $OUT/server.js"
