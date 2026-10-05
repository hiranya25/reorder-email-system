import { toCsv } from "../csv";
import type { CustomerRecord } from "../import/types";
import { displayProductName } from "./product-text";

/**
 * Catalog template listing every purchased SKU with its sales description,
 * so the team only has to fill in links, stock and new-season flags.
 */
export function catalogTemplateCsv(customers: CustomerRecord[]): string {
  const seen = new Map<string, { name: string; category: string; origin: string }>();
  for (const c of customers)
    for (const i of c.items) {
      const prev = seen.get(i.sku);
      if (!prev || (!prev.name && i.name)) seen.set(i.sku, { name: i.name, category: i.category, origin: i.origin ?? "" });
    }
  const rows = [...seen].sort((a, b) => a[0].localeCompare(b[0])).map(([sku, v]) => [sku, v.name ? displayProductName(v.name) : "", "", "", v.category, v.origin, "", "yes", "no", ""]);
  return toCsv([["SKU", "Product name", "Image URL", "Product URL", "Category", "Origin", "Price", "In stock", "New this season", "Replacement SKU"], ...rows]);
}
