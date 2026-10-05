import type { CustomerRecord } from "../import/types";
import type { CatalogIndex } from "./resolve";
import type { Product, ProductEdits } from "./types";

export const PICK_SLOTS = 3;

/** Customer group used to choose the 3 new picks: dominant origin + top category by quantity. */
export function segmentOf(c: CustomerRecord): string {
  const byOrigin = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const i of c.items) {
    if (i.origin) byOrigin.set(i.origin, (byOrigin.get(i.origin) ?? 0) + i.qty);
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.qty);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return [top(byOrigin), top(byCategory)].filter(Boolean).join(" · ") || "All customers";
}

/** SKUs per slot ("" = empty), per group and per-customer overrides. */
export interface RecommendationPicks {
  bySegment: Record<string, string[]>;
  byCustomer: Record<string, string[]>;
}

export const EMPTY_PICKS: RecommendationPicks = { bySegment: {}, byCustomer: {} };

export interface SegmentSummary {
  key: string;
  customers: number;
  /** Customers in the group with their own picks. */
  overridden: number;
  picks: string[];
  filled: number;
}

export function segmentSummaries(customers: CustomerRecord[], picks: RecommendationPicks): SegmentSummary[] {
  const groups = new Map<string, { customers: number; overridden: number }>();
  for (const c of customers) {
    const key = segmentOf(c);
    const g = groups.get(key) ?? { customers: 0, overridden: 0 };
    g.customers++;
    if (picks.byCustomer[c.accountId]) g.overridden++;
    groups.set(key, g);
  }
  return [...groups]
    .map(([key, g]) => {
      const slots = Array.from({ length: PICK_SLOTS }, (_, i) => picks.bySegment[key]?.[i] ?? "");
      return { key, ...g, picks: slots, filled: slots.filter(Boolean).length };
    })
    .sort((a, b) => b.customers - a.customers || a.key.localeCompare(b.key));
}

/**
 * The new-season products one customer sees: their own picks or their group's,
 * skipping anything they already bought, hidden or out of stock.
 */
export function picksFor(c: CustomerRecord, picks: RecommendationPicks, catalog: CatalogIndex, edits: ProductEdits): Product[] {
  const skus = picks.byCustomer[c.accountId] ?? picks.bySegment[segmentOf(c)] ?? [];
  const bought = new Set(c.items.map((i) => i.sku));
  const out: Product[] = [];
  for (const sku of skus) {
    const p = sku ? catalog.get(sku) : undefined;
    if (!p || bought.has(sku) || p.inStock === false || edits.hidden.includes(sku)) continue;
    out.push(p);
  }
  return out;
}

/** Done when every group has all slots filled. */
export function recommendationsComplete(summaries: SegmentSummary[]): boolean {
  return summaries.length > 0 && summaries.every((s) => s.filled === PICK_SLOTS || s.overridden === s.customers);
}

/**
 * Fills empty slots for a group with new-season, in-stock products: same category and
 * origin first, then same category, then any new item. Existing picks are kept.
 */
export function suggestPicks(segmentKey: string, current: string[], products: Product[], edits: ProductEdits): string[] {
  const [first, second] = segmentKey.split(" · ");
  const origin = second ? first : undefined;
  const category = second ?? first;
  const usable = products.filter((p) => p.isNew && p.inStock !== false && !edits.hidden.includes(p.sku));
  const ranked = [
    ...usable.filter((p) => p.category === category && (!origin || p.origin === origin)),
    ...usable.filter((p) => p.category === category),
    ...usable.filter((p) => !origin || p.origin === origin),
    ...usable,
  ];
  const slots = Array.from({ length: PICK_SLOTS }, (_, i) => current[i] ?? "");
  const taken = new Set(slots.filter(Boolean));
  for (let i = 0; i < PICK_SLOTS; i++) {
    if (slots[i]) continue;
    const next = ranked.find((p) => !taken.has(p.sku));
    if (!next) break;
    slots[i] = next.sku;
    taken.add(next.sku);
  }
  return slots;
}
