import type { CustomerRecord } from "@reorder/core";
import { firstNameFromEmail, repDisplayName } from "./names";
import { displayProductName, metalFromSku } from "./product";

export interface Brand {
  brandName: string;
  companyName: string;
  address: string;
}

export const PLACEHOLDER_BRAND: Brand = {
  brandName: "[YOUR BRAND]",
  companyName: "[Company name]",
  address: "[Business address]",
};

export interface EmailItem {
  sku: string;
  name: string;
  /** "Natural · 14K white gold" */
  meta: string;
  qty: number;
  imageUrl?: string;
  url?: string;
}

export interface EmailPick {
  name?: string;
  imageUrl?: string;
  url?: string;
}

export interface EmailModel {
  accountId: string;
  company: string;
  to: string[];
  subject: string;
  preheader: string;
  /** Name after "Hi": a first name, or "<Company> team". */
  greetingName: string;
  greetingFromEmail: boolean;
  intro: string;
  /** "holiday" in "Restock your holiday bestsellers". */
  seasonWord: string;
  seasonCode: string;
  items: EmailItem[];
  /** Products bought last season that aren't shown. */
  moreCount: number;
  /** Products skipped because they have no description. */
  undescribedCount: number;
  totalProducts: number;
  reorderUrl?: string;
  picks: EmailPick[];
  repName?: string;
  /** Recommendation group, e.g. "Natural · Bracelets". */
  segment: string;
  brand: Brand;
}

export interface BuildEmailInput {
  customer: CustomerRecord;
  /** Approved addresses; falls back to the file's addresses for previews. */
  emails: string[];
  campaignName: string;
  seasonStart: string;
  topN?: number;
  brand?: Brand;
  reorderUrl?: string;
  picks?: EmailPick[];
}

/** First real word of the campaign name: "Holiday 2026 Reorder" -> "holiday". */
export function seasonWordFrom(campaignName: string): string {
  const word = campaignName.split(/\s+/).find((w) => /^[a-z]{3,}$/i.test(w) && !/^(the|reorder|restock|campaign)$/i.test(w));
  return (word ?? "season").toLowerCase();
}

/** "Holiday 2026 Reorder" + 2025-10-01 -> "HOLIDAY-2025" */
export function seasonCodeFrom(campaignName: string, seasonStart: string): string {
  return `${seasonWordFrom(campaignName).toUpperCase()}-${seasonStart.slice(0, 4)}`;
}

function segmentFor(c: CustomerRecord): string {
  const byOrigin = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const i of c.items) {
    if (i.origin) byOrigin.set(i.origin, (byOrigin.get(i.origin) ?? 0) + i.qty);
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.qty);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return [top(byOrigin), top(byCategory)].filter(Boolean).join(" · ") || "All customers";
}

export function buildEmailModel(input: BuildEmailInput): EmailModel {
  const { customer: c } = input;
  const topN = input.topN ?? 3;
  const to = input.emails.length ? input.emails : c.emails;
  const first = to.map(firstNameFromEmail).find(Boolean);
  const seasonWord = seasonWordFrom(input.campaignName);
  const Season = seasonWord.charAt(0).toUpperCase() + seasonWord.slice(1);
  const described = c.items.filter((i) => i.name);
  const shown = described.slice(0, topN);

  return {
    accountId: c.accountId,
    company: c.name,
    to,
    subject: `Restock your ${seasonWord} bestsellers`,
    preheader: `${shown.length === 1 ? "Your bestseller" : `Your ${shown.length} bestsellers`} from last ${seasonWord} season, ready to reorder in one click.`,
    greetingName: first ?? `${c.name} team`,
    greetingFromEmail: !!first,
    intro: `${Season} season is here. These pieces sold for you last year, so here they are again, ready to restock in a click.`,
    seasonWord,
    seasonCode: seasonCodeFrom(input.campaignName, input.seasonStart),
    items: shown.map((i) => ({
      sku: i.sku,
      name: displayProductName(i.name),
      meta: [i.origin, metalFromSku(i.sku)].filter(Boolean).join(" · "),
      qty: i.qty,
    })),
    moreCount: Math.max(0, c.items.length - shown.length),
    undescribedCount: c.items.length - described.length,
    totalProducts: c.items.length,
    reorderUrl: input.reorderUrl,
    picks: input.picks ?? [{}, {}, {}],
    repName: repDisplayName(c.rep),
    segment: segmentFor(c),
    brand: input.brand ?? PLACEHOLDER_BRAND,
  };
}
