import type { StepKey } from "@reorder/core";

export interface CampaignNavItem {
  slug: string;
  label: string;
  /** Step this screen belongs to; the item is dimmed until that step can start. */
  step?: StepKey;
}

export const CAMPAIGN_NAV: CampaignNavItem[] = [
  { slug: "overview", label: "Overview" },
  { slug: "import", label: "Import data" },
  { slug: "mapping", label: "Customer mapping" },
  { slug: "products", label: "Product check", step: "products" },
  { slug: "recommendations", label: "Recommendations", step: "recommendations" },
  { slug: "preview", label: "Email preview" },
  { slug: "approve", label: "Approve & sync", step: "approve" },
  { slug: "results", label: "Results", step: "send" },
];
