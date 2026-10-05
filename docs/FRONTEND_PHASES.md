# Frontend build phases

The frontend is built first. Each phase gets its own branch, **stacked on the previous one**, so it can be reviewed and merged in order.
Until the backend exists, all data is **parsed in the browser** from the uploaded export. It is kept only in the viewer's browser storage, and a synthetic demo dataset is shown when nothing has been uploaded.
Email brand stays as the `[YOUR BRAND]` placeholder.

| Phase | Branch | Scope | Done when |
|---|---|---|---|
| F1 Foundation & shell | `claude/frontend-f1-foundation` | pnpm monorepo, Next.js + Tailwind, design tokens from the mockups, console shell (sidebar, page header), shared components (StepTracker, StatCard, StatusChip, IssueRow, BarList, SplitBar, buttons), routes for every screen, Campaigns home, client-side campaign store, synthetic demo data, CI (lint, typecheck, test) | App runs; shell matches mockups; every nav item routes |
| F2 Import & Overview | `claude/frontend-f2-import-overview` | `packages/core` parse → normalize → aggregate → classify → issues; Import screen (drag & drop, column mapping, season window, validation report, problem-row CSV download); Overview wired to real numbers | Uploading the sample export shows the mockup's numbers |
| F3 Customer mapping | `claude/frontend-f3-mapping` | Mapping table (filters, search, rep filter, sorting, paging, approve / exclude / add email / pick one or both emails, bulk approve and exclude, undo), progress card, emails remembered for next season | Every account can be approved or excluded |
| F4 Email template & preview | `claude/frontend-f4-email-preview` | `packages/email` template (one source: real data or Mailchimp merge tags), Email preview screen (customer picker, checks, sending details, desktop/mobile) | Preview matches the mockup for any customer |
| F5 Products & recommendations | `claude/frontend-f5-products-recs` | Catalog upload (.xlsx/.csv, matched columns, downloadable template prefilled with purchased SKUs); Product check (no name / not in catalog / no image / out of stock, rename, replacement SKU, hide, confirm); groups and 3-pick Recommendations with Suggest picks and per-customer overrides; email preview uses catalog images, links, replacements and picks | Blockers clear once a catalog is uploaded and picks are set |
| F6 Approve, results, settings | `claude/frontend-f6-approve-results` | Approve & sync (who gets the email, readiness checklist, typed APPROVE to lock, reopen, Mailchimp template + contacts CSV with merge fields and campaign tag), lock on review screens, activity log, Results (empty until Mailchimp is connected), Settings (brand, Reorder button: web link or email to sales team, review rules, test list, roles, clear data), Playwright full-flow test in CI | Full flow import → approve → CSV works end to end |

Notes:
- Decisions agreed for mapping: accounts sharing one email each get their own email (no merging); a field with two emails can send to one or both; large accounts are emailed normally and flagged for a rep follow-up.
- Excel files are read with `read-excel-file` (.xlsx) and CSVs with `papaparse`. The SheetJS copy on npm is an old version with known security issues, and its own download server isn't reachable from the build environment. Old `.xls` files are rejected with a "save as .xlsx" message.
- Email: greeting uses a first name only when the email address clearly starts with one (oliver@ -> "Hi Oliver,"), otherwise "Hi <Company> team,". The Reorder button is a placeholder until open question #4 is decided; the preview flags it.
- Mailchimp merge tags can be at most 10 characters, so tags differ slightly from plan §10.1: `GREETING, COMPANY, CUST_ID, SEASON, MORECOUNT, REPNAME, REORDERURL, ITEMn_NAME/_META/_SKU/_QTY/_IMG/_URL, RECn_NAME/_IMG/_URL`.
- Catalog: no export exists yet, so the catalog upload accepts any file with a SKU column; the template download lists every purchased SKU so the team only adds links, stock and new-season flags. Renames and replacement SKUs are remembered across seasons; hiding is per campaign. Customers never get a pick they already bought.
- Reorder button: Settings offers a web link (with {CUST_ID}/{SEASON}) or a pre-written email to the sales team; approval is blocked until one is chosen. Links longer than Mailchimp's 255-character limit are shortened safely (item list dropped), never cut.
- Browser data lives in IndexedDB (falls back to memory when storage is blocked).

The backend (DB, auth, Mailchimp sync) follows these phases, as described in `IMPLEMENTATION_PLAN.md`.
