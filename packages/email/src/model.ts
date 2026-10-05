import { EMPTY_EDITS, metalFromSku, resolveItems, segmentOf, type CatalogIndex, type CustomerRecord, type Product, type ProductEdits } from "@reorder/core";
import { firstNameFromEmail, repDisplayName } from "./names";

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
  /** Products left out of the email, by reason. */
  leftOut: { noName: number; outOfStock: number; hidden: number };
  /** Shown products that were swapped for their replacement. */
  replacedCount: number;
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
  /** Catalog and Product check edits; without them items show sales descriptions and no images. */
  catalog?: CatalogIndex;
  edits?: ProductEdits;
  /** New-season products for this customer (see picksFor). */
  picks?: Product[];
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

export function buildEmailModel(input: BuildEmailInput): EmailModel {
  const { customer: c } = input;
  const topN = input.topN ?? 3;
  const to = input.emails.length ? input.emails : c.emails;
  const first = to.map(firstNameFromEmail).find(Boolean);
  const seasonWord = seasonWordFrom(input.campaignName);
  const Season = seasonWord.charAt(0).toUpperCase() + seasonWord.slice(1);
  const edits = input.edits ?? EMPTY_EDITS;
  const resolved = resolveItems(c, input.catalog ?? new Map(), edits);
  const included = resolved.filter((r) => !r.excluded);
  const shown = included.slice(0, topN);
  const count = (reason: string) => resolved.filter((r) => r.excluded === reason).length;
  const catalog = input.catalog;

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
    items: shown.map((r) => ({
      sku: r.sku,
      name: r.name,
      meta: [catalog?.get(r.sku)?.origin ?? r.item.origin, metalFromSku(r.sku)].filter(Boolean).join(" · "),
      qty: r.item.qty,
      imageUrl: r.imageUrl,
      url: r.url,
    })),
    moreCount: Math.max(0, included.length - shown.length),
    leftOut: { noName: count("no_name"), outOfStock: count("out_of_stock"), hidden: count("hidden") },
    replacedCount: shown.filter((r) => r.replacedFrom).length,
    totalProducts: c.items.length,
    reorderUrl: input.reorderUrl,
    picks: [0, 1, 2].map((i) => {
      const p = input.picks?.[i];
      return p ? { name: edits.displayName[p.sku] ?? p.name, imageUrl: p.imageUrl, url: p.productUrl } : {};
    }),
    repName: repDisplayName(c.rep),
    segment: segmentOf(c),
    brand: input.brand ?? PLACEHOLDER_BRAND,
  };
}
