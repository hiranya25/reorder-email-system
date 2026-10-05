import type { StepKey } from "@reorder/core";

export interface CampaignNavItem {
  slug: string;
  label: string;
  /** Step this screen belongs to; the item is dimmed until that step can start. */
  step?: StepKey;
  /** Frontend phase that builds the screen (see docs/FRONTEND_PHASES.md). */
  phase: string;
}

export const CAMPAIGN_NAV: CampaignNavItem[] = [
  { slug: "overview", label: "Overview", phase: "F1" },
  { slug: "import", label: "Import data", phase: "F2" },
  { slug: "mapping", label: "Customer mapping", phase: "F3" },
  { slug: "products", label: "Product check", step: "products", phase: "F5" },
  { slug: "recommendations", label: "Recommendations", step: "recommendations", phase: "F5" },
  { slug: "preview", label: "Email preview", phase: "F4" },
  { slug: "approve", label: "Approve & sync", step: "approve", phase: "F6" },
  { slug: "results", label: "Results", step: "send", phase: "F6" },
];

export function navItem(slug: string): CampaignNavItem {
  const item = CAMPAIGN_NAV.find((n) => n.slug === slug);
  if (!item) throw new Error(`Unknown campaign screen: ${slug}`);
  return item;
}
