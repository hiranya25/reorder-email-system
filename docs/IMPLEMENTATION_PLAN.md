# Reorder Console — Implementation Plan

Source docs: *Reorder_Email_System_Project_Plan.pdf* (v1.0), *Reorder_Console.pdf* (3 mockups: Overview, Customer mapping, Email preview), *Last_Year_Oct-Jan_Sales_Data.xlsx*.
Target: **Option A, the full Reorder Console**. Phase 1 is an MVP that works without the Mailchimp API (it exports a CSV), and Phase 2 adds direct sync.
The repo `reorder-email-system` is empty right now, so this plan starts from scratch.

---

## 1. What the real data tells us (this changes parts of the spec)

I profiled the xlsx. **This file is a one-time sample, only used to check that upload works.** It is never committed to the repo or used as a permanent test. It still tells us what a Power BI export looks like and what data problems the import must handle. The mockup numbers come from it, so after the import is built we upload it once by hand and check that the Overview shows the same numbers:

| Fact | Value | Matches mockup |
|---|---|---|
| Sheet `Export`, 10 cols, 1,360 rows incl. a trailing **`Total`** row | 1,359 real lines | "1,359 lines" ✓ |
| Customers (`Account_id`) | 225 | ✓ |
| Units (`Trans_qty` sum) | 2,039 | ✓ |
| SKUs (`item_id`) | 597 | ✓ |
| Sales reps | 19 | ✓ |
| Lab grown share of lines | 63.3% | ✓ |
| Repeat acct+SKU lines merged across months | 91 | "combined 91 repeat lines" ✓ |
| Products per customer: 1 / 2 / 3+ | 81 / 37 / 107 | ✓ |
| Customers by category (Bracelet 109, Studs 90, Necklace 62, Band 45, Hoops 31, Rings 22, Bangle 21, Pendant 20) | | ✓ |
| SKUs with blank `style_desc` | 19 SKUs / 45 lines | blocker #2 ✓ |
| No email | 9 accounts | ✓ |
| Ready / Review (my first-pass rules) | 185 / 31 | mockup 184 / 32: one generic-inbox pattern is still missing (mockup says 29 generic, I find 28) |

**Columns:** `Account_id, Customer Name, email, trans_dt - Month_2025, origin, Trans_qty, Item Category, item_id, style_desc, Assigned Sales Rep`

**Gaps compared with the spec (§6.1):**
- **There is no value or price column.** Ranking has to use quantity (the spec allows this). Revenue attribution can't come from this file.
- **The month has no year.** It holds October, November, December and January only, so we infer Oct–Dec 2025 and Jan 2026 from the campaign's season window.
- **There is no contact first name.** The mockup's "Hi Oliver" has to come from the Mailchimp `FNAME`, then a name-like email local part, then "Hi there".
- **There is no catalog** (images, URLs, prices, stock). This is blocker #1, and the Product check step stays blocked until a catalog is uploaded.
- **`item_id` encodes attributes:** a leading `L` means lab grown, `-14W` / `-14Y` / `-PT` give the metal, and suffixes like `-IGI` / `-EGL` give the certificate. Parse these for the email subtitle ("Natural · 14K white gold") and for recommendation grouping.
- **Categories are messy:** mixed case (`rings`, `pendant`), plus `MISC`, `EARRINGS` and one blank. Normalise to Title Case plurals.
- **Email problems:** one field holds two emails separated by `;`, `luiskury@gmail.com` is shared by two accounts (Joyeria Universal and its Branch 1), and 28–29 addresses are generic inboxes (info@, sales@, office@, email@, contact@).
- **This is B2B wholesale** (jewelers buying from you), which answers open question #5. The email footer in the mockup already says "wholesale customer".

---

## 2. Working assumptions (defaults until the open questions are answered)

| Open Q | Default we build to | Swappable via |
|---|---|---|
| #1 Data source | Manual xlsx/csv upload with saved column mapping | Import adapter interface |
| #2 Shared ID | `Account_id` → written to Mailchimp as `CUST_ID` after approval | — |
| #3/#4 Reorder destination | `REORDER_URL` built by a **pluggable link builder**: `shopify_cart` / `reorder_form` / `mailto_rep`. MVP ships `reorder_form`, an internal page that notifies the rep | Settings |
| #7 Mailchimp plan | Tag + regular campaign to the tagged segment (works on every plan) | Settings |
| #9 Prices | Not shown | Template flag |
| #10 Multiple contacts | Reviewer picks one; "send to both" allowed | Mapping UI |
| #11 Recommendations | Per **segment** = top category × origin (e.g. "Natural · Tennis bracelets" in mockup) | — |
| #14 Claude & real data | Build and test with small **synthetic** files; the real sample is uploaded once by hand, never committed | — |

---

## 3. Stack & repo layout

As in spec §9.1 / §11.1, with concrete picks:

- **Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui**, **TanStack Table**
- **Postgres on Supabase** with `pg_trgm`, accessed through **Drizzle** ORM and migrations. Supabase Storage holds the raw uploads.
- **Auth.js (NextAuth) Google provider**, restricted to the company domain, with roles stored in the DB
- **Inngest** for import, match and sync jobs (retries and a dashboard)
- **SheetJS** for parsing, both client-side for the instant preview and server-side as the source of truth
- **MJML** for the email template, compiled to inline-CSS HTML. One template renders in two modes (see §7).
- **Vitest** (unit), **Playwright** (e2e, Chromium is already installed), **Sentry**
- **pnpm** monorepo, so the processing logic is testable and reusable by Option B:

```
apps/console/            Next.js app (UI + route handlers)
  app/(auth)/login
  app/campaigns/                       campaigns home
  app/campaigns/[id]/{overview,import,mapping,products,recommendations,preview,approve,results}
  app/settings/{mailchimp,users,audit}
  app/api/...                          see §8
  components/ui/                       shadcn
  components/console/                  Sidebar, StepTracker, StatCard, StatusChip, IssueRow, BarList, SplitBar …
packages/core/           PURE TS, no I/O — all business rules, 100% unit tested
  parse/        xlsx → raw rows, column mapping, Total-row & blank detection
  normalize/    category, style_desc, sku attributes (origin/metal/cert), company name
  aggregate/    group acct×sku, merge months, rank top-N
  mapping/      email classification (ready/review/none + reasons), Mailchimp matching tiers 1–5
  segment/      top category × origin
  payload/      merge-field builder, 255-char truncation, UTM links
  issues/       blockers / review / auto-fixed list for Overview
packages/db/             Drizzle schema + migrations + seed (synthetic demo campaign)
packages/email/          MJML template, render(previewData) & render(mergeTags)
packages/mailchimp/      typed client: members upsert, batch ops, tags, merge-field setup
fixtures/                small synthetic xlsx/csv files (~20 rows each), one per edge case: Total row, multi-email, shared email, generic inbox, blank email, blank description, renamed/reordered columns, missing column, csv vs xlsx
```

---

## 4. Design system taken from the mockups

**Layout:** a fixed left sidebar about 240px wide, a content area on a light grey background (`#F3F4F6`), white cards with a 1px border and roughly 12px radius, and a breadcrumb, H1, subtitle and right-aligned action buttons at the top of each page.

**Tokens** (sampled by eye; confirm against brand guidelines, Q#15):

| Token | Use | Approx |
|---|---|---|
| `--sidebar` | Sidebar bg | `#161B26` |
| `--navy` | Primary buttons, active step, bars, email header | `#1E2A44` |
| `--gold` | Logo, Reorder CTA, avatar, section labels in email | `#B08D57` |
| `--cream` | Product image placeholder, split bar | `#F2EDE4` / `#D9C49A` |
| `--ok` bg/fg | DONE, READY, AUTO-FIXED | `#E3F1E7` / `#1F6B3A` |
| `--warn` bg/fg | REVIEW, Needs review | `#FBEFD9` / `#8A5A00` |
| `--bad` bg/fg | BLOCKED, BLOCKER, NO EMAIL | `#F8E1E1` / `#A12A2A` |
| Font | UI | Inter (or similar grotesk); mono for emails/SKUs (`JetBrains Mono`) |
| Email brand font | Wordmark | Serif with wide tracking (Cormorant / Playfair) |

**Shared components:**
- `Sidebar`: logo (diamond icon), "Reorder Console / Restock email system", a CAMPAIGN group with 8 nav items (the active one gets a navy pill, steps not yet reachable are dimmed), and a user footer with avatar, name and role.
- `StepTracker`: 8 tiles. Each tile has a state of `done` (green), `in_progress` (navy, filled), `blocked` (red) or `not_started` (grey), plus a subtitle metric, and the header reads "Step X of 8 · nothing has been sent".
- `StatCard`: a label tinted by status, a big number and a caption.
- `BarList` for the horizontal category bars, and `SplitBar` for the stacked proportion bar with inline labels.
- `StatusChip` with a sub-reason line ("READY / One clear email on file").
- `IssueRow`: a severity badge, plain-language text and an action (a button, or a "Review" link that deep-links into the mapping screen with a filter).
- A `ConfirmDialog` sits in front of every irreversible action (spec §9.4).

---

## 5. Data model (Drizzle, packages/db)

Extends spec §11.2 with what the data needs:

```
users(id, email, name, role: admin|reviewer|viewer)
campaigns(id, name "Holiday 2026 Reorder", season_code "HOL-2026", season_start, season_end,
          status enum[draft,imported,mapped,curated,previewed,approved,synced,sent],
          top_n default 3, approved_by, approved_at, locked bool, created_at)
sales_imports(id, campaign_id, file_name, storage_path, column_mapping jsonb, row_count,
              report jsonb /* validation + auto-fix summary */, imported_by, created_at)
sales_lines(id, import_id, account_id, customer_name, email_raw, month, year_inferred,
            origin, qty, category_raw, category, sku, style_desc, rep)
customers(account_id PK, name, name_normalized, rep, first_seen_campaign)
customer_emails(id, account_id, email, source: sales|mailchimp|manual)
customer_mappings(id, account_id, campaign_id NULL /* NULL = remembered across seasons */,
                  status enum[ready,review,no_email,approved,excluded],
                  reasons text[] /* generic_inbox, multi_email, shared_email, large_account */,
                  chosen_emails text[], mailchimp_contact_id, match_tier 1–5, confidence,
                  decided_by, decided_at)
mailchimp_contacts(id, email, fname, lname, company, status, tags jsonb, cust_id, synced_at)
products(sku PK, style_desc, category, origin, metal, cert, image_url, product_url, price,
         in_stock, is_new_season, successor_sku, catalog_import_id)
customer_items(campaign_id, account_id, sku, qty, rank, eligible bool, exclude_reason)
segments(id, campaign_id, key "Natural·Bracelets", rule jsonb)
recommendations(id, campaign_id, segment_id NULL, account_id NULL /* override */, slot 1–3, sku)
email_payloads(campaign_id, account_id, merge_fields jsonb, hash, status ready|blocked, block_reasons)
sync_jobs(id, campaign_id, started_by, counts jsonb, errors jsonb, status)
audit_logs(id, user_id, action, entity, entity_id, before jsonb, after jsonb, at)
```

Rule: once a campaign is `locked` (approved), the DB refuses edits to its mappings, recommendations and payloads. Enforce this in the service layer and check it in tests.

---

## 6. Processing pipeline (packages/core, pure functions)

These follow spec §11.5, adjusted to the real file:

1. **Parse.** Read the first sheet, auto-detect the header row and suggest a column mapping from fuzzy header names. Save the mapping per data source so the next season's upload maps itself. Drop the `Total` row and record it as **auto-fixed**.
2. **Validate.** Produce a report of errors and warnings in plain language (§9.4), for example "45 lines (19 SKUs) have no description — download list". Rows missing an account or SKU are rejected.
3. **Normalise.** Clean up categories (`rings`→Rings, `BRACELET`→Bracelets, MISC/EARRINGS/blank → Other), collapse whitespace in style_desc, and parse origin, metal and certificate from the SKU (cross-check origin against the `origin` column). Lower-case and trim emails, and split them on `;` or `,`.
4. **Infer the year.** Place each month inside the campaign's season window (Oct–Dec belongs to the start year, Jan to the next year).
5. **Aggregate.** Group by acct × SKU and sum qty. Report the 91 merged lines as auto-fixed.
6. **Classify emails** for mapping (in priority order; one account can carry several reasons):
   - `no_email` if the field is empty
   - `review: multi_email` if it contains more than one address
   - `review: shared_email` if the same email appears on more than one account ("shared with Branch 1 (7749)")
   - `review: generic_inbox` if the local part is in {info, sales, office, email, contact, admin, orders, service, hello, store, shop, …}. The list is editable in Settings, not hard-coded to one file's results.
   - `+ large_account` is an extra tag when the account has 20 or more products, which feeds the "consider a rep follow-up" issue. The 20-product threshold is a campaign setting.
   - Otherwise `ready`.
   - Approved decisions from earlier seasons (`campaign_id NULL`) are applied first, so they auto-approve.
7. **Mailchimp match** (Phase 2): tier 1 is `CUST_ID`, tier 2 an exact email, tier 3 a normalised company name, tier 4 trigram similarity or a matching domain, tier 5 none. Only `subscribed` contacts are eligible.
8. **Rank.** Take the top N items by qty, breaking ties by the most recent month and then by SKU. Drop discontinued or out-of-stock items, or swap them for their `successor_sku`. Keep the "+9 more products" count for the email.
9. **Segment.** Each customer's top category by qty, combined with their dominant origin, gives a segment such as "Natural · Tennis bracelets".
10. **Build the payload.** Fill the merge fields from spec §10.1 and add `REORDER_SEASON`, `MORE_COUNT`, `REP_NAME` and `ITEMn_META` ("Natural · 14K white gold") and `ITEMn_QTY` ("You ordered 10"). Truncate every value to 255 characters and add UTM tags (`utm_source=mailchimp&utm_campaign=<season>&utm_content=item1…`).
11. **Final validate.** Block an account when it has no approved mapping, is unsubscribed, has zero eligible items, or is missing a name or image (warning or blocker, as configured).

**Upload must be generic.** Each season's export may differ (new columns, renamed headers, different months, a different number of customers). Nothing in the code assumes this file's columns, months, categories or counts:
- Required fields are matched to columns through the column-mapping step. If a required column is missing, the import stops with a plain-language error. Extra columns are ignored.
- Value, price and order date are used when present, and ranking falls back to quantity when they are not.
- Unknown categories are passed through as-is, and the Overview charts are built from whatever categories exist.
- Accepts .xlsx, .xls and .csv, finds the header row even if it isn't row 1, and detects total/subtotal rows by pattern, not by position.

**One-time acceptance check:** upload the real sample in a preview deploy and confirm the Overview shows 1,359 lines, 225 customers, 2,039 units, 597 SKUs and 9 no-email, matching the mockup. Then delete that test campaign and its stored file.

---

## 7. Email template (packages/email)

The template is written once in MJML and rendered in two modes:
- `render(customerData)` produces real HTML for the in-console preview and for test sends.
- `render(MERGE_TAGS)` produces HTML with `*|ITEM1_NAME|*` and wraps optional slots in `*|IF:ITEM2_NAME|* … *|END:IF|*`. This is the copy uploaded to Mailchimp as a saved template.

Because both modes come from one source, the preview cannot drift from what actually goes out.

Structure, matching mockup 3: a navy header with the brand wordmark; "Hi *|FNAME|*,"; a seasonal intro line; a gold "YOU ORDERED THESE LAST SEASON" label; 3 product cards (image, name, meta line, SKU in mono, "You ordered N"); "+N more products · See your full order history"; a gold **REORDER THESE ITEMS →** button with helper text; a divider; "NEW THIS SEASON, PICKED FOR YOU" with 3 cards and "View style →" links; "just reply and *|REP_NAME|*, your account rep…"; and a footer with company and address and the unsubscribe link.

Technical rules from spec §10:
- 600px table layout that stacks on mobile
- Empty slots are hidden
- Fallback image and alt text on every image
- A CI check fails if the HTML is over 102 KB
- Dark-mode meta tags

---

## 8. Screens (build specs)

Every screen uses the shell from §4. An action only appears if the user's role allows it (spec §9.2).

**Campaigns home**: a table of campaigns with a mini step tracker, the current status and any blockers, plus a "New campaign" dialog (name, season window, top-N).

**1. Overview** (mockup 1)
- Header: breadcrumb, campaign name, "Built from last season's sales, Oct 2025 – Jan 2026 · `<filename>`", and buttons [Re-import data] [Continue to <next step> →].
- StepTracker ×8, with the state derived from the campaign plus its blockers.
- 4 StatCards: Customers, Ready, Needs review, No email.
- "Customers by category bought" as a BarList.
- "Products per customer" as a SplitBar (1 · 2 · 3+), "Lab grown vs natural" as a SplitBar, and a units / SKUs (styles) / reps trio.
- "Issues to resolve before sending": IssueRows sorted blocker → review → auto-fixed, each with an action. "Review" links deep-link to `/mapping?filter=generic` and similar.

**2. Import data**
- A drag-and-drop zone that parses in the browser and shows the first 20 rows instantly.
- A column-mapping form (auto-filled and saved), the season date picker, and the validation report (errors, warnings, auto-fixes) with downloadable CSVs of problem rows.
- [Confirm import] runs the server job and shows progress.

**3. Customer mapping** (mockup 2)
- Header text plus [Approve all ready], with a confirm dialog showing the count.
- A progress card: "Reviewed X of N", with ready / review / no-email counts.
- Filter pills that show counts: All · Ready · Needs review · No email. There is also a search box (customer, account or email) and a Sales rep dropdown.
- A TanStack table with the columns ACCT · CUSTOMER · EMAIL (mono) · PRODUCTS · REP · CHECK (chip plus reason) · DECISION.
- Decisions:
  - Ready → [Approve]
  - Review → [Approve] [Exclude]. Multi-email rows open a picker ("pick one or send to both"), and shared-email rows offer "Merge into a single email?".
  - No email → [Add email] (inline input with validation) [Exclude]
- Row selection supports bulk approve and exclude. The footer reads "Approved emails are saved, so next season these customers match automatically."
- Phase 2 adds a "Mailchimp contact" column with a tier badge and a [Search Mailchimp] popover.

**4. Product check**
- Starts BLOCKED until a catalog has been uploaded (CSV, or a Shopify import if Q#3 says Shopify).
- A table of purchased SKUs showing description, image, stock and successor, with "missing description", "no image" and "discontinued" filters.
- Actions are hide, set successor, and edit the display name.

**5. Recommendations**
- A list of segments showing the customer count and 3 product slots each, filled from a visual catalog grid that can be filtered to new-season items.
- Per-customer overrides, and a "who gets which picks" preview table.

**6. Email preview** (mockup 3)
- Left column:
  - "Preview as customer": a searchable list with name, account number and product count.
  - "Checks for this email": a ✓/⚠ list computed from the payload validation.
  - "Sending details": To, Subject, Recommendation group.
- Right column: a Desktop/Mobile toggle that switches the iframe between 600px and 375px, and the rendered HTML from `GET /preview/:customerId`.
- [Send test to team] sends to the seed list from Settings.

**7. Approve & sync**
- A summary of recipients, exclusions and blockers. Approval is blocked while any blocker remains.
- [Approve & lock] is reviewer-only, needs a typed confirmation and writes to the audit log.
- Phase 1 offers [Download Mailchimp CSV] for manual import.
- Phase 2 adds [Sync to Mailchimp] (admin-only, available after approval) with a progress bar, an error list and a [Retry failed] button.

**8. Results**: opens, clicks, reorder clicks and recommendation clicks, broken down by segment and rep, with CSV export. Uses the Mailchimp reports API plus UTM data.

**Settings**: Mailchimp connection (key, audience, a "create merge fields" button), the reorder-link mode, the seed list, users and roles, and the audit log viewer.

---

## 9. API (Next.js route handlers)

These come from spec §11.3, plus the endpoints the screens need:

```
POST   /api/campaigns                         create
GET    /api/campaigns/:id/overview            stats + steps + issues (one call for Overview)
POST   /api/campaigns/:id/import              upload → Inngest job → validation report
GET    /api/campaigns/:id/mappings?status&rep&q
PATCH  /api/mappings/:id                      approve | exclude | set emails
POST   /api/campaigns/:id/mappings/approve-ready
POST   /api/campaigns/:id/match               Mailchimp matching job (P2)
POST   /api/catalog/import                    products CSV / Shopify
GET    /api/campaigns/:id/products            purchased SKUs + catalog status
PUT    /api/campaigns/:id/recommendations
GET    /api/campaigns/:id/preview/:accountId  ?mode=html|json
POST   /api/campaigns/:id/test-send
POST   /api/campaigns/:id/approve             reviewer; locks
GET    /api/campaigns/:id/export.csv          P1 manual Mailchimp import
POST   /api/campaigns/:id/sync                admin; after approve (P2)
GET    /api/campaigns/:id/results
```

Every mutation goes through one `withAuth(role)` wrapper, is validated with Zod, and writes an audit_log entry.

---

## 10. Mailchimp integration (Phase 2)

- **One-time setup:** create the merge fields through the API, and make the setup idempotent (read existing fields first).
- **Per-contact sync:** `PUT /lists/{id}/members/{md5(lower(email))}` with `status_if_new: never` (we only update existing subscribers), then `POST …/tags` with `reorder-HOL2026`. Send these as a batch operation for large audiences and keep to 10 or fewer concurrent connections.
- **Idempotency:** store a `payload.hash` and skip contacts whose hash hasn't changed. A retry only touches failed rows.
- **Send:** the reviewer sends a regular campaign to the tagged segment from Mailchimp. Optionally, a Customer Journey triggers on the tag.
- **Cleanup job:** after the season, blank the ITEM and REC fields and remove the tag.

---

## 11. Security

- Secrets live only in server environment variables.
- Login is through the Google domain, and roles are checked server-side on every route.
- Only `subscribed` contacts are emailed.
- Raw uploads go in a private bucket, and data is kept for 2 seasons, then purged by a cron job.
- Real customer files are never committed to git. Tests use synthetic data only, and the test campaign from the one-time upload check is deleted afterwards.

---

## 12. Testing

- **Unit** (packages/core):
  - every synthetic edge-case file from `fixtures/` imports with the expected report (errors, warnings, auto-fixes)
  - email classification cases (multi, shared, generic, none)
  - SKU attribute parsing, ranking and tie-breaks
  - 255-character truncation, UTM building
  - template slot hiding when a customer bought 1 or 2 products
- **Integration:**
  - the Mailchimp client against a private test audience (or a recorded mock)
  - an idempotent re-sync
- **E2E** (Playwright): import a synthetic file → Overview counts match the file → approve all ready → add email → exclude → preview one customer → approve → export CSV.
- **Email:** an HTML size check in CI, plus a manual Litmus or Email-on-Acid pass, or a seed-list send to Gmail, Outlook and Apple Mail.

---

## 13. Build sequence (about 6 weeks, one developer)

**Phase 0: foundation (week 1)**
1. pnpm monorepo, Next.js, Tailwind, shadcn, ESLint/Prettier, Vitest, a GitHub Actions CI, and a Vercel project with preview deploys.
2. The design tokens and console shell (Sidebar, StepTracker, StatCard, chips), built against static fixture JSON. **Sign-off: the shell matches the 3 mockups.**
3. The MJML email template rendered from fixture data, with **an email mockup sent to Founder and Shruti**.
4. Synthetic edge-case test files.

**Phase 1: MVP (weeks 2–3, pilot can run)**
5. `packages/core` parse, normalise, aggregate and issues, with all edge-case tests passing. Then run the one-time upload check with the real sample.
6. DB schema and migrations, Auth.js Google login, roles.
7. The Import screen and job, then **Overview wired to real data**.
8. Email classification and the Customer mapping screen (filters, search, approve, exclude, add email, bulk, memory across seasons).
9. Catalog CSV import and the Product check screen.
10. Segments and the Recommendations screen.
11. Payload builder, the Email preview screen and test sends (through Mailchimp transactional or SMTP to the seed list).
12. Approve & lock, CSV export for a manual Mailchimp import, and the audit log.
13. **Milestone:** an internal test with 5 customers on the seed list, then a pilot with 15–25 customers.

**Phase 2: production (weeks 4–5)**
14. Mailchimp client, merge-field setup, contact cache and tier 1–5 matching (pg_trgm).
15. Sync job with Inngest (batch, retry, idempotent), progress UI and error list.
16. Sentry, a job dashboard and full E2E. **Milestone: full launch.**

**Phase 3: optimisation (week 6 onward)**
17. Results dashboard (Mailchimp reports and UTM data), with CSV export.
18. Rule-based recommendations (V2): new arrivals in the top category, matching origin, not previously bought, in stock.
19. Season cleanup job, a re-run of next season using saved mappings, documentation and handover.

---

## 14. What still blocks specific steps

| Step | Blocked by |
|---|---|
| Product check, real images in the email | **Product catalog export** (SKU, image URL, product URL, stock, new-season flag) |
| REORDER_URL | Q#3/#4: Shopify cart permalink or reorder form? (A Shopify connector is available in this environment, so if the store is on Shopify, catalog and cart links can come from there.) |
| Phase 2 sync | Mailchimp API key, audience ID and plan (Shruti) |
| Greeting first names | Whether Mailchimp contacts have `FNAME` filled |
| Brand header and footer | Logo, brand font, company address (Q#15) |
| Using real data in dev | Founder's answer to Q#14; until then, synthetic data only (the sample file is used for the single upload check) |

**Recommended first PR:** Phase 0 steps 1–4. That gives a deployable console shell that looks like the mockups, plus the email template and the synthetic test files.
