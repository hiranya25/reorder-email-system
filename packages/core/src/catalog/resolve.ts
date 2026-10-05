import type { CustomerItem, CustomerRecord } from "../import/types";
import { displayProductName, tidyProductName } from "./product-text";
import type { Product, ProductEdits } from "./types";

export type CatalogIndex = Map<string, Product>;

export function indexCatalog(products: Product[] | undefined): CatalogIndex {
  return new Map((products ?? []).map((p) => [p.sku, p]));
}

/** A purchased item as it will appear in the email, or why it's left out. */
export interface ResolvedItem {
  /** What was bought. */
  item: CustomerItem;
  /** What the email shows: the same SKU, or its replacement. */
  sku: string;
  name: string;
  imageUrl?: string;
  url?: string;
  replacedFrom?: string;
  /** Present when the item is left out of the email. */
  excluded?: "hidden" | "out_of_stock" | "no_name";
}

/**
 * Applies the catalog and reviewer edits to one purchased item.
 * Order: hidden -> out of stock (use replacement if it's available) -> name.
 */
export function resolveItem(item: CustomerItem, catalog: CatalogIndex, edits: ProductEdits): ResolvedItem {
  if (edits.hidden.includes(item.sku)) return { item, sku: item.sku, name: "", excluded: "hidden" };
  let product = catalog.get(item.sku);
  let sku = item.sku;
  let replacedFrom: string | undefined;

  if (product?.inStock === false) {
    const nextSku = edits.successor[item.sku] ?? product.successorSku;
    const next = nextSku ? catalog.get(nextSku) : undefined;
    if (!next || next.inStock === false || edits.hidden.includes(next.sku)) return { item, sku, name: "", excluded: "out_of_stock" };
    replacedFrom = sku;
    sku = next.sku;
    product = next;
  } else if (edits.successor[item.sku] && catalog.get(edits.successor[item.sku]!)) {
    // Reviewer chose a replacement even though the original is still listed.
    replacedFrom = sku;
    sku = edits.successor[item.sku]!;
    product = catalog.get(sku);
  }

  const name = edits.displayName[sku] ?? (product?.name ? tidyProductName(product.name) : replacedFrom ? "" : item.name ? displayProductName(item.name) : "");
  if (!name) return { item, sku, name: "", excluded: "no_name" };
  return { item, sku, name, imageUrl: product?.imageUrl, url: product?.productUrl, replacedFrom };
}

export function resolveItems(c: CustomerRecord, catalog: CatalogIndex, edits: ProductEdits): ResolvedItem[] {
  return c.items.map((i) => resolveItem(i, catalog, edits));
}

export type ProductProblem = "not_in_catalog" | "no_name" | "no_image" | "out_of_stock" | "replaced" | "hidden";

export interface ProductCheckRow {
  sku: string;
  /** Best available name: edit, catalog, then sales description. */
  name: string;
  salesName: string;
  product?: Product;
  customers: number;
  units: number;
  /** Customers for whom this item is among the top N shown in the email. */
  shownTo: number;
  problems: ProductProblem[];
  replacement?: string;
}

/** One row per purchased SKU with what would stop it from showing well in the email. */
export function productCheck(customers: CustomerRecord[], catalog: CatalogIndex, edits: ProductEdits, topN: number): ProductCheckRow[] {
  const rows = new Map<string, ProductCheckRow>();
  for (const c of customers) {
    const resolved = resolveItems(c, catalog, edits);
    const shown = new Set(resolved.filter((r) => !r.excluded).slice(0, topN).map((r) => r.item.sku));
    for (const r of resolved) {
      const i = r.item;
      let row = rows.get(i.sku);
      if (!row) {
        const product = catalog.get(i.sku);
        row = { sku: i.sku, name: "", salesName: i.name, product, customers: 0, units: 0, shownTo: 0, problems: [] };
        rows.set(i.sku, row);
      }
      if (!row.salesName && i.name) row.salesName = i.name;
      row.customers++;
      row.units += i.qty;
      if (shown.has(i.sku)) row.shownTo++;
    }
  }
  for (const row of rows.values()) {
    const sample = resolveItem({ sku: row.sku, name: row.salesName, category: "", qty: 0, lines: 0, lastPeriod: { year: 0, month: 1 } }, catalog, edits);
    const p = row.product;
    row.name = edits.displayName[row.sku] ?? (p?.name ? tidyProductName(p.name) : row.salesName ? displayProductName(row.salesName) : "");
    if (sample.excluded === "hidden") row.problems.push("hidden");
    if (!p) row.problems.push("not_in_catalog");
    if (sample.excluded === "out_of_stock") row.problems.push("out_of_stock");
    if (sample.replacedFrom) {
      row.problems.push("replaced");
      row.replacement = sample.sku;
    }
    if (sample.excluded === "no_name") row.problems.push("no_name");
    if (!sample.excluded && !sample.imageUrl) row.problems.push("no_image");
  }
  return [...rows.values()].sort((a, b) => b.shownTo - a.shownTo || b.units - a.units || a.sku.localeCompare(b.sku));
}
