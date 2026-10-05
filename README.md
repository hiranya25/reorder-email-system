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
```

Until the backend exists, campaigns are stored in your browser only. The **Holiday 2026 Reorder (demo)** campaign uses synthetic numbers.

## Layout

```
apps/console     Next.js app: the Reorder Console UI
packages/core    Business rules with no I/O (steps, formatting; parsing and matching arrive in F2)
```
