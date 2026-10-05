import { toCsv, reportRowsToCsv } from "./csv";
import type { ImportResult } from "./import/types";
import type { Issue } from "./types";

function n(x: number) {
  return x.toLocaleString("en-US");
}

/** Lists more than this many individual email problems as one grouped issue. */
const MAX_INDIVIDUAL = 3;

export interface IssueContext {
  catalogUploaded: boolean;
  largeAccountProducts: number;
}

/** Everything the Overview lists under "Issues to resolve before sending". */
export function buildIssues(result: ImportResult, ctx: IssueContext): Issue[] {
  const { customers, stats, report } = result;
  const issues: Issue[] = [];
  const skuCount = new Set(customers.flatMap((c) => c.items.map((i) => i.sku))).size;

  if (!ctx.catalogUploaded) {
    issues.push({ id: "catalog", severity: "blocker", message: `Product catalog not uploaded. No images, product links or prices for the ${n(skuCount)} SKUs.`, action: { label: "Upload catalog", href: "products", kind: "button" } });
  }
  if (stats.undescribedSkus.length) {
    issues.push({
      id: "no_description",
      severity: "blocker",
      message: `${n(stats.undescribedSkus.length)} product${stats.undescribedSkus.length === 1 ? "" : "s"} (${n(stats.undescribedLines)} sales line${stats.undescribedLines === 1 ? "" : "s"}) ${stats.undescribedSkus.length === 1 ? "has" : "have"} no description, so there is nothing to show in the email.`,
      action: { label: "Download list", kind: "button", download: { fileName: "products-without-description.csv", csv: toCsv([["SKU", "Sales lines", "Customers"], ...stats.undescribedSkus.map((s) => [s.sku, String(s.lines), String(s.customers)])]) } },
    });
  }

  const generic = customers.filter((c) => c.reasons.includes("generic_inbox"));
  if (generic.length) {
    issues.push({ id: "generic", severity: "review", message: `${n(generic.length)} account${generic.length === 1 ? " uses" : "s use"} a generic inbox (info@, sales@, office@) that may not reach the buyer.`, action: { label: "Review", href: "mapping?filter=generic", kind: "link" } });
  }

  // Each shared email once, not once per account.
  const sharedGroups = new Map<string, string[]>();
  for (const c of customers.filter((c) => c.reasons.includes("shared_email"))) {
    const key = [c.accountId, ...c.sharedWith.map((s) => s.accountId)].sort().join("|");
    if (!sharedGroups.has(key)) sharedGroups.set(key, [c.name, ...c.sharedWith.map((s) => s.name)]);
  }
  if (sharedGroups.size > MAX_INDIVIDUAL) {
    issues.push({ id: "shared", severity: "review", message: `${n(sharedGroups.size)} groups of accounts share one email. Merge each into a single email?`, action: { label: "Review", href: "mapping?filter=shared", kind: "link" } });
  } else {
    for (const [key, names] of sharedGroups) {
      const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
      issues.push({ id: `shared:${key}`, severity: "review", message: `${list} share one email. Merge into a single email?`, action: { label: "Review", href: "mapping?filter=shared", kind: "link" } });
    }
  }

  const multi = customers.filter((c) => c.reasons.includes("multi_email"));
  if (multi.length > MAX_INDIVIDUAL) {
    issues.push({ id: "multi", severity: "review", message: `${n(multi.length)} accounts have more than one email in one field. Pick one or send to both.`, action: { label: "Review", href: "mapping?filter=multi", kind: "link" } });
  } else {
    for (const c of multi) {
      issues.push({ id: `multi:${c.accountId}`, severity: "review", message: `${c.name} has ${c.emails.length === 2 ? "two" : c.emails.length} emails in one field. Pick one or send to both.`, action: { label: "Review", href: "mapping?filter=multi", kind: "link" } });
    }
  }

  const large = customers.filter((c) => c.large);
  if (large.length) {
    issues.push({ id: "large", severity: "review", message: `${n(large.length)} large account${large.length === 1 ? "" : "s"} bought more than ${ctx.largeAccountProducts} products each. A top-3 email under-represents them; consider a rep follow-up instead.`, action: { label: "Review", href: "mapping?filter=large", kind: "link" } });
  }

  // Lines left out at import (description problems are already a blocker above).
  for (const w of report.warnings.filter((w) => w.id !== "no_description")) {
    issues.push({
      id: `import:${w.id}`,
      severity: "review",
      message: w.message,
      action: w.rows?.length ? { label: "Download rows", kind: "button", download: { fileName: `${w.id.replace(/_/g, "-")}.csv`, csv: reportRowsToCsv(w.rows) } } : undefined,
    });
  }

  if (report.autoFixes.length) {
    issues.push({ id: "auto_fixed", severity: "auto_fixed", message: report.autoFixes.map((f) => f.message.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join(", ").replace(/^./, (c) => c.toUpperCase()) + "." });
  }
  return issues;
}
