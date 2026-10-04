import type { Campaign, CampaignSummary, Issue } from "./types";

/**
 * Synthetic demo campaign shown before anything is uploaded.
 * Numbers are illustrative only; no real customer data lives in the repo.
 */
export const DEMO_CAMPAIGN: Campaign = {
  id: "demo",
  name: "Holiday 2026 Reorder",
  seasonStart: "2025-10-01",
  seasonEnd: "2026-01-31",
  status: "imported",
  fileName: "demo_sales_export.xlsx",
  createdAt: "2026-10-01T09:00:00.000Z",
  isDemo: true,
};

export const DEMO_SUMMARY: CampaignSummary = {
  lines: 1240,
  customers: 210,
  ready: 172,
  review: 30,
  noEmail: 8,
  units: 1880,
  skus: 560,
  styles: 330,
  reps: 18,
  categories: [
    { name: "Bracelets", customers: 101 },
    { name: "Studs", customers: 84 },
    { name: "Necklaces", customers: 58 },
    { name: "Bands", customers: 41 },
    { name: "Hoops", customers: 29 },
    { name: "Rings", customers: 20 },
    { name: "Bangles", customers: 19 },
    { name: "Pendants", customers: 18 },
  ],
  productsPerCustomer: { one: 76, two: 34, threePlus: 100 },
  origin: { labGrown: 0.62, natural: 0.38 },
};

/** Issues shown for the demo campaign until F2 computes them from the upload. */
export const DEMO_ISSUES: Issue[] = [
  { id: "catalog", severity: "blocker", message: "Product catalog not uploaded. No images, product links or prices for the 560 SKUs.", action: { label: "Upload catalog", href: "products", kind: "button" } },
  { id: "no-desc", severity: "blocker", message: "17 products (41 sales lines) have no description, so there is nothing to show in the email.", action: { label: "Download list", kind: "button" } },
  { id: "generic", severity: "review", message: "27 accounts use a generic inbox (info@, sales@, office@) that may not reach the buyer.", action: { label: "Review", href: "mapping?filter=generic", kind: "link" } },
  { id: "shared", severity: "review", message: "Northwind Jewelers and Northwind Jewelers Branch 1 share one email. Merge into a single email?", action: { label: "Review", href: "mapping?filter=shared", kind: "link" } },
  { id: "multi", severity: "review", message: "Harbor & Vale has two emails in one field. Pick one or send to both.", action: { label: "Review", href: "mapping?filter=multi", kind: "link" } },
  { id: "large", severity: "review", message: "6 large accounts bought 20+ products each. A top-3 email under-represents them; consider a rep follow-up instead.", action: { label: "Review", href: "mapping?filter=large", kind: "link" } },
  { id: "autofix", severity: "auto_fixed", message: "Removed the \"Total\" row, combined 84 repeat lines across months, standardized category names." },
];
