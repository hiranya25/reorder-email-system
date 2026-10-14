# Reorder Email System

Internal **Reorder Console** for building personalised restock / reorder emails from last season's sales.

- Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Frontend phases & branches: [`docs/FRONTEND_PHASES.md`](docs/FRONTEND_PHASES.md)

## Run locally

Requires Node 22, pnpm 10 and PostgreSQL.

```bash
pnpm install
cp apps/console/.env.example apps/console/.env.local   # then edit DATABASE_URL / APP_SECRET
set -a; . apps/console/.env.local; set +a
pnpm db:migrate
pnpm create-admin you@amipi.com   # prints a one-time sign-in setup link
pnpm dev          # http://localhost:3000
pnpm test         # unit tests (packages/core)
pnpm lint && pnpm typecheck && pnpm build
apps/console/scripts/prepare-standalone.sh && pnpm --filter @reorder/console e2e   # sign-in + full campaign flow in Chromium (after build)
```

Sign-in (email + password + authenticator code) and users live in PostgreSQL. Campaign data is still stored in each browser (IndexedDB) until phase B2 moves it to the server. The **Holiday 2026 Reorder (demo)** campaign runs a synthetic sample export through the same pipeline; download it from the Import screen to try an upload.

## Layout

```
apps/console     Next.js app: the Reorder Console UI
packages/core    Business rules with no I/O: import pipeline, email checks, mapping decisions, summary, issues, steps
packages/db      PostgreSQL schema and migrations (Drizzle)
packages/auth    Sign-in: passwords, authenticator codes, sessions, invites, roles
packages/email   Customer email: model, hand-coded HTML (preview and Mailchimp merge-tag template), merge fields, checks
```

## Deploy

InMotion cPanel: see [`docs/DEPLOY_CPANEL.md`](docs/DEPLOY_CPANEL.md).
