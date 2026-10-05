# Reorder Email System

Internal **Reorder Console** for building personalised restock / reorder emails from last season's sales.

- Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Frontend phases & branches: [`docs/FRONTEND_PHASES.md`](docs/FRONTEND_PHASES.md)

## Run locally

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # unit tests (packages/core)
pnpm lint && pnpm typecheck && pnpm build
pnpm --filter @reorder/console e2e   # full campaign flow in Chromium (after build)
```

Until the backend exists, uploads are read and stored in your browser only (IndexedDB). The **Holiday 2026 Reorder (demo)** campaign runs a synthetic sample export through the same pipeline; download it from the Import screen to try an upload.

## Layout

```
apps/console     Next.js app: the Reorder Console UI
packages/core    Business rules with no I/O: import pipeline, email checks, mapping decisions, summary, issues, steps
packages/email   Customer email: model, hand-coded HTML (preview and Mailchimp merge-tag template), merge fields, checks
```
