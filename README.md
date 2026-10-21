# Reorder Email System

Internal **Reorder Console** for building personalised restock / reorder emails from last season's sales.

- Plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Frontend phases & branches: [`docs/FRONTEND_PHASES.md`](docs/FRONTEND_PHASES.md)

## Run locally

Requires Node 22, pnpm 10 and PostgreSQL. Create the local database user and database once:

```bash
sudo -u postgres psql -c "CREATE ROLE reorder LOGIN PASSWORD 'reorder';"   # or: ALTER ROLE reorder PASSWORD 'reorder';
sudo -u postgres psql -c "CREATE DATABASE reorder_dev OWNER reorder;"
```

```bash
pnpm install
cp apps/console/.env.example apps/console/.env.local   # then edit DATABASE_URL / APP_SECRET
set -a; . apps/console/.env.local; set +a
pnpm db:migrate
pnpm create-admin   # asks for the first admin's name, username, email and password
pnpm dev          # http://localhost:3000 (builds each page the first time you open it, so first clicks are slow)
pnpm preview      # the fast production build on http://localhost:3000, as on the server
pnpm test         # unit tests (packages/core)
pnpm lint && pnpm typecheck && pnpm build
apps/console/scripts/prepare-standalone.sh && pnpm --filter @reorder/console e2e   # sign-in + full campaign flow in Chromium (after build)
```

Everything lives in PostgreSQL: users and sign-in ("Sign in with Microsoft" or "Sign in with Google"; username or email + password, optionally with a 6-digit authenticator code via AUTHENTICATOR_CODE=on), campaigns, imports, review decisions, the catalog, picks, approvals and the activity log. Every change is checked on the server for the user's role and the campaign's lock. The **Holiday 2026 Reorder (demo)** campaign runs a synthetic sample export through the same pipeline; download it from the Import screen to try an upload.

## Layout

```
apps/console     Next.js app: the Reorder Console UI
packages/core    Business rules with no I/O: import pipeline, email checks, mapping decisions, summary, issues, steps
packages/db      PostgreSQL schema and migrations (Drizzle)
packages/auth    Sign-in: Microsoft/Google (OpenID Connect), passwords, authenticator codes, sessions, invites, roles
packages/mailchimp  Mailchimp API client, contact sync and an in-memory fake for tests
packages/email   Customer email: model, hand-coded HTML (preview and Mailchimp merge-tag template), merge fields, checks
```

## Deploy

InMotion cPanel: see [`docs/DEPLOY_CPANEL.md`](docs/DEPLOY_CPANEL.md).
