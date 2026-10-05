import { normalizeCategory, normalizeOrigin, normalizeText, parseMoney } from "../import/normalize";
import { cellText, missingRequiredFields, type Cell, type ColumnMapping, type Row } from "../import/sheet";
import type { ReportRow } from "../import/types";
import { CATALOG_FIELDS, type CatalogFieldKey } from "./fields";
import type { CatalogReport, Product } from "./types";

/** yes/no, true/false, in stock/out of stock, or a quantity. */
export function parseStock(cell: Cell): boolean | undefined {
  if (typeof cell === "number") return cell > 0;
  if (typeof cell === "boolean") return cell;
  const v = cellText(cell).toLowerCase();
  if (!v) return undefined;
  if (/^(no|n|false|0|out|out of stock|sold out|discontinued|inactive|archived|draft|unavailable)$/.test(v)) return false;
  if (/^(yes|y|true|in stock|available|active|instock)$/.test(v)) return true;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n > 0 : undefined;
}

function parseFlag(cell: Cell): boolean {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell > 0;
  return /^(yes|y|true|1|new|new season|new arrival|x)$/i.test(cellText(cell));
}

function httpUrl(cell: Cell): string | undefined | null {
  const v = cellText(cell);
  if (!v) return undefined;
  return /^https?:\/\/\S+$/i.test(v) ? v : null;
}

export function processCatalog(rows: Row[], headerRow: number, mapping: ColumnMapping<CatalogFieldKey>): { products: Product[]; report: CatalogReport } {
  const missing = missingRequiredFields(mapping, CATALOG_FIELDS);
  if (missing.length) {
    return { products: [], report: { errors: [{ id: "missing_columns", count: 1, message: "Choose the column that holds the SKU / product code." }], warnings: [] } };
  }
  const headers = (rows[headerRow] ?? []).map(cellText);
  const get = (row: Row, key: CatalogFieldKey) => (mapping[key] === undefined ? undefined : row[mapping[key]!]);
  const values = (row: Row) => Object.fromEntries(headers.map((h, i) => [h || `Column ${i + 1}`, cellText(row[i])]));

  const bySku = new Map<string, Product>();
  const noSku: ReportRow[] = [];
  const dupes: ReportRow[] = [];
  const badUrl: ReportRow[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => cellText(c) === "")) continue;
    const sku = cellText(get(row, "sku")).toUpperCase();
    if (!sku) {
      noSku.push({ row: r + 1, values: values(row) });
      continue;
    }
    if (bySku.has(sku)) dupes.push({ row: r + 1, values: values(row) });
    const image = httpUrl(get(row, "imageUrl"));
    const page = httpUrl(get(row, "productUrl"));
    if (image === null || page === null) badUrl.push({ row: r + 1, values: values(row) });
    const rawCategory = cellText(get(row, "category"));
    const successor = cellText(get(row, "successorSku")).toUpperCase();
    bySku.set(sku, {
      sku,
      name: normalizeText(cellText(get(row, "name"))),
      imageUrl: image ?? undefined,
      productUrl: page ?? undefined,
      category: rawCategory ? normalizeCategory(rawCategory) : undefined,
      origin: normalizeOrigin(cellText(get(row, "origin"))),
      price: mapping.price === undefined ? undefined : parseMoney(get(row, "price")),
      inStock: mapping.inStock === undefined ? undefined : parseStock(get(row, "inStock")),
      isNew: mapping.isNew !== undefined && parseFlag(get(row, "isNew")),
      successorSku: successor && successor !== sku ? successor : undefined,
    });
  }

  const products = [...bySku.values()];
  const report: CatalogReport = { errors: [], warnings: [] };
  if (products.length === 0) report.errors.push({ id: "empty", count: 0, message: "No products with a SKU were found. Check the SKU column." });
  const n = (x: number, one: string) => `${x.toLocaleString("en-US")} ${one}${x === 1 ? "" : "s"}`;
  if (noSku.length) report.warnings.push({ id: "no_sku", count: noSku.length, rows: noSku, message: `${n(noSku.length, "row")} without a SKU ${noSku.length === 1 ? "was" : "were"} skipped.` });
  if (dupes.length) report.warnings.push({ id: "duplicate_sku", count: dupes.length, rows: dupes, message: `${n(dupes.length, "SKU")} appeared more than once; the last row was used.` });
  if (badUrl.length) report.warnings.push({ id: "bad_url", count: badUrl.length, rows: badUrl, message: `${n(badUrl.length, "row")} ${badUrl.length === 1 ? "has" : "have"} a link that isn't a full https:// address; ${badUrl.length === 1 ? "it was" : "they were"} ignored.` });
  return { products, report };
}
