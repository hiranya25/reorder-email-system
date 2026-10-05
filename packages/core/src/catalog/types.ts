import type { Origin } from "../import/normalize";
import type { NamedMapping } from "../import/sheet";
import type { ReportItem } from "../import/types";
import type { CatalogFieldKey } from "./fields";

export interface Product {
  sku: string;
  name: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  origin?: Origin;
  price?: number;
  /** Undefined when the catalog has no stock column. */
  inStock?: boolean;
  isNew: boolean;
  successorSku?: string;
}

export interface CatalogReport {
  errors: ReportItem[];
  warnings: ReportItem[];
}

export interface CatalogRecord {
  fileName: string;
  importedAt: string;
  mapping: NamedMapping<CatalogFieldKey>;
  products: Product[];
  report: CatalogReport;
}

/** Reviewer decisions on the Product check screen. */
export interface ProductEdits {
  /** SKUs left out of this campaign's emails. */
  hidden: string[];
  /** Replacement shown instead of a discontinued SKU. Kept across seasons. */
  successor: Record<string, string>;
  /** Better display name than the catalog or sales description. Kept across seasons. */
  displayName: Record<string, string>;
}

export const EMPTY_EDITS: ProductEdits = { hidden: [], successor: {}, displayName: {} };
