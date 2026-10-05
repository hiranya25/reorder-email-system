export interface ReadinessInput {
  pendingAccounts: number;
  catalogUploaded: boolean;
  productsConfirmed: boolean;
  recommendationsComplete: boolean;
  reorderLinkSet: boolean;
  brandSet: boolean;
  /** Emails that would go out right now. */
  emails: number;
}

export interface ReadinessItem {
  id: string;
  ok: boolean;
  /** Blocking items must be ok before approval; others are warnings. */
  blocking: boolean;
  text: string;
  /** Campaign screen (or "/settings") that fixes it. */
  href: string;
}

/** The checklist on Approve & sync. Approval is possible when every blocking item is ok. */
export function approvalReadiness(i: ReadinessInput): ReadinessItem[] {
  return [
    { id: "mapping", ok: i.pendingAccounts === 0, blocking: true, href: "mapping", text: i.pendingAccounts === 0 ? "Every account approved or excluded" : `${i.pendingAccounts.toLocaleString("en-US")} account${i.pendingAccounts === 1 ? "" : "s"} still to approve or exclude` },
    { id: "catalog", ok: i.catalogUploaded, blocking: true, href: "products", text: i.catalogUploaded ? "Product catalog uploaded" : "Product catalog not uploaded" },
    { id: "products", ok: i.productsConfirmed, blocking: true, href: "products", text: i.productsConfirmed ? "Product check confirmed" : "Product check not confirmed" },
    { id: "recommendations", ok: i.recommendationsComplete, blocking: true, href: "recommendations", text: i.recommendationsComplete ? "Every group has 3 new-season picks" : "Some groups still need new-season picks" },
    { id: "reorder", ok: i.reorderLinkSet, blocking: true, href: "/settings", text: i.reorderLinkSet ? "Reorder button link set" : "Reorder button link not set (Settings)" },
    { id: "emails", ok: i.emails > 0, blocking: true, href: "mapping", text: i.emails > 0 ? `${i.emails.toLocaleString("en-US")} emails ready` : "No emails to send yet" },
    { id: "brand", ok: i.brandSet, blocking: false, href: "/settings", text: i.brandSet ? "Brand name and address set" : "Brand name and address are still placeholders (Settings)" },
  ];
}

export function canApprove(items: ReadinessItem[]): boolean {
  return items.every((r) => r.ok || !r.blocking);
}
