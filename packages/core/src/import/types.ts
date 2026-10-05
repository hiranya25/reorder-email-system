import type { Period } from "./dates";
import type { Origin } from "./normalize";
import type { NamedMapping } from "./sheet";

export interface CustomerItem {
  sku: string;
  /** Empty when the export had no description for this SKU. */
  name: string;
  category: string;
  origin?: Origin;
  qty: number;
  value?: number;
  /** Number of sales lines merged into this item. */
  lines: number;
  lastPeriod: Period;
}

export type ReviewReason = "multi_email" | "shared_email" | "generic_inbox" | "invalid_email";
export type EmailCheck = "ready" | "review" | "no_email";

export interface CustomerRecord {
  accountId: string;
  name: string;
  emails: string[];
  rep: string;
  /** Sorted best first: quantity, then value, then most recent. */
  items: CustomerItem[];
  units: number;
  lines: number;
  check: EmailCheck;
  reasons: ReviewReason[];
  /** Other accounts using the same email. */
  sharedWith: { accountId: string; name: string }[];
  /** Raw email text that could not be read, if any. */
  invalidEmails: string[];
  large: boolean;
}

export interface ReportRow {
  /** 1-based row number in the sheet, as the user sees it in Excel. */
  row: number;
  values: Record<string, string>;
}

export interface ReportItem {
  id: string;
  message: string;
  count: number;
  /** Rows to download so the problem can be fixed at the source. */
  rows?: ReportRow[];
}

export interface ValidationReport {
  /** Stop the import. */
  errors: ReportItem[];
  /** Lines left out or needing attention; the import can continue. */
  warnings: ReportItem[];
  autoFixes: ReportItem[];
}

export interface ImportStats {
  rowsRead: number;
  linesKept: number;
  totalRowsRemoved: number;
  repeatLinesCombined: number;
  categoriesRenamed: number;
  /** SKUs with no product name, with how many lines and customers they affect. */
  undescribedSkus: { sku: string; lines: number; customers: number }[];
  undescribedLines: number;
  labGrownLines: number;
  naturalLines: number;
}

export interface ImportResult {
  customers: CustomerRecord[];
  report: ValidationReport;
  stats: ImportStats;
  /** Present when the file has an order value column. */
  hasValue: boolean;
}

export interface ImportRecord {
  fileName: string;
  sheetName: string;
  importedAt: string;
  mapping: NamedMapping;
  result: ImportResult;
}
