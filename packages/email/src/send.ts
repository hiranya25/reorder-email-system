import {
  picksFor,
  toCsv,
  type CatalogIndex,
  type MappingRow,
  type ProductEdits,
  type RecommendationPicks,
} from "@reorder/core";
import { MERGE_VALUE_MAX, mergeFields } from "./merge";
import { buildEmailModel, type Brand, type EmailModel } from "./model";

/** What the REORDER button opens. "none" = not decided yet (blocks approval). */
export type ReorderSetting =
  | { mode: "none" }
  | { mode: "url"; /** May contain {CUST_ID}, {SEASON}. */ template: string }
  | { mode: "mailto"; /** Where reorder emails go when the rep has no address. */ address: string };

export const DEFAULT_REORDER: ReorderSetting = { mode: "none" };

/** Builds the reorder link for one email. Mailto links list the items and quantities. */
export function reorderUrlFor(m: Pick<EmailModel, "accountId" | "company" | "seasonCode" | "items">, setting: ReorderSetting): string | undefined {
  if (setting.mode === "url") {
    const url = setting.template.replace(/\{CUST_ID\}/g, encodeURIComponent(m.accountId)).replace(/\{SEASON\}/g, encodeURIComponent(m.seasonCode));
    return /^https?:\/\//i.test(url) ? url : undefined;
  }
  if (setting.mode === "mailto" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setting.address)) {
    const lines = m.items.map((i) => `- ${i.name} (${i.sku}) x ${i.qty}`).join("\n");
    const subject = `Reorder for ${m.company} (${m.accountId})`;
    const body = `Hi, we'd like to reorder:\n${lines}\n\nPlease confirm availability and pricing.`;
    const full = `mailto:${setting.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // Mailchimp stores at most 255 characters per field; a cut link would break.
    return full.length <= MERGE_VALUE_MAX ? full : `mailto:${setting.address}?subject=${encodeURIComponent(subject)}`;
  }
  return undefined;
}

export interface SendContext {
  campaignName: string;
  seasonStart: string;
  catalog: CatalogIndex;
  edits: ProductEdits;
  picks: RecommendationPicks;
  brand: Brand;
  reorder: ReorderSetting;
}

export type SkipReason = "not_decided" | "excluded" | "no_products";

export interface SendList {
  /** One entry per approved account with something to show. */
  emails: EmailModel[];
  /** Total addresses (an account may send to two). */
  recipients: number;
  skipped: { accountId: string; name: string; reason: SkipReason }[];
}

export function buildSendList(rows: MappingRow[], ctx: SendContext): SendList {
  const emails: EmailModel[] = [];
  const skipped: SendList["skipped"] = [];
  for (const r of rows) {
    const c = r.customer;
    if (r.status !== "approved") {
      skipped.push({ accountId: c.accountId, name: c.name, reason: r.status === "excluded" ? "excluded" : "not_decided" });
      continue;
    }
    const model = buildEmailModel({
      customer: c,
      emails: r.emails,
      campaignName: ctx.campaignName,
      seasonStart: ctx.seasonStart,
      brand: ctx.brand,
      catalog: ctx.catalog,
      edits: ctx.edits,
      picks: picksFor(c, ctx.picks, ctx.catalog, ctx.edits),
    });
    if (model.items.length === 0) {
      skipped.push({ accountId: c.accountId, name: c.name, reason: "no_products" });
      continue;
    }
    model.reorderUrl = reorderUrlFor(model, ctx.reorder);
    emails.push(model);
  }
  return { emails, recipients: emails.reduce((n, e) => n + e.to.length, 0), skipped };
}

/** Mailchimp tag added to every contact in this campaign, e.g. "reorder-HOLIDAY-2025". */
export function campaignTag(seasonCode: string): string {
  return `reorder-${seasonCode}`;
}

/**
 * CSV for Mailchimp's contact import: one row per address, every merge field,
 * plus a Tags column so the campaign can be sent to the tagged segment.
 */
export function mailchimpImportCsv(list: SendList): string {
  const first = list.emails[0];
  if (!first) return toCsv([["Email Address"]]);
  const fieldNames = Object.keys(mergeFields(first));
  const rows: string[][] = [["Email Address", ...fieldNames, "Tags"]];
  for (const m of list.emails) {
    const f = mergeFields(m);
    for (const address of m.to) rows.push([address, ...fieldNames.map((k) => f[k] ?? ""), campaignTag(m.seasonCode)]);
  }
  return toCsv(rows);
}
