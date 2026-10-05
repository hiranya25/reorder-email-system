# Frontend build phases

The frontend is built first. Each phase gets its own branch, **stacked on the previous one**, so it can be reviewed and merged in order.
Until the backend exists, all data is **parsed in the browser** from the uploaded export. It is kept only in the viewer's browser storage, and a synthetic demo dataset is shown when nothing has been uploaded.
Email brand stays as the `[YOUR BRAND]` placeholder.

| Phase | Branch | Scope | Done when |
|---|---|---|---|
| F1 Foundation & shell | `claude/frontend-f1-foundation` | pnpm monorepo, Next.js + Tailwind, design tokens from the mockups, console shell (sidebar, page header), shared components (StepTracker, StatCard, StatusChip, IssueRow, BarList, SplitBar, buttons), routes for every screen, Campaigns home, client-side campaign store, synthetic demo data, CI (lint, typecheck, test) | App runs; shell matches mockups; every nav item routes |
| F2 Import & Overview | `claude/frontend-f2-import-overview` | `packages/core` parse → normalize → aggregate → classify → issues; Import screen (drag & drop, column mapping, season window, validation report, problem-row CSV download); Overview wired to real numbers | Uploading the sample export shows the mockup's numbers |
| F3 Customer mapping | `claude/frontend-f3-mapping` | Mapping table (filters, search, rep filter, approve / exclude / add email / pick email / merge shared, bulk approve), progress card, remembered decisions | Every account can be approved or excluded |
| F4 Email template & preview | `claude/frontend-f4-email-preview` | `packages/email` template (one source: real data or Mailchimp merge tags), Email preview screen (customer picker, checks, sending details, desktop/mobile) | Preview matches the mockup for any customer |
| F5 Products & recommendations | `claude/frontend-f5-products-recs` | Catalog upload (CSV) and Product check (missing description / image / discontinued, successor, hide); segments and 3-pick Recommendations with per-customer overrides | Blockers clear once a catalog is uploaded and picks are set |
| F6 Approve, results, settings | `claude/frontend-f6-approve-results` | Approve & lock with confirmation, Mailchimp CSV export, local audit log, Results (empty state until Mailchimp), Settings (generic-inbox list, thresholds, roles view), Playwright e2e | Full flow import → approve → CSV works end to end |

Notes:
- Excel files are read with `read-excel-file` (.xlsx) and CSVs with `papaparse`. The SheetJS copy on npm is an old version with known security issues, and its own download server isn't reachable from the build environment. Old `.xls` files are rejected with a "save as .xlsx" message.
- Browser data lives in IndexedDB (falls back to memory when storage is blocked).

The backend (DB, auth, Mailchimp sync) follows these phases, as described in `IMPLEMENTATION_PLAN.md`.
