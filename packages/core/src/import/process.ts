import { parseOrderDate, periodIndex } from "./dates";
import { FIELDS, type FieldKey } from "./fields";
import { displayCompanyName, isTotalLabel, normalizeCategory, normalizeOrigin, normalizeText, parseEmails, parseMoney, parseQuantity } from "./normalize";
import { DEFAULT_RULES, type ReviewRules } from "./rules";
import { cellText, missingRequiredFields, type ColumnMapping, type Row } from "./sheet";
import type { CustomerItem, CustomerRecord, ImportResult, ReportItem, ReportRow, ReviewReason } from "./types";

export interface ProcessOptions {
  seasonStart: string;
  seasonEnd: string;
  rules?: ReviewRules;
}

const MAX_REPORT_ROWS = 5000;

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

class Bucket {
  rows: ReportRow[] = [];
  count = 0;
  add(row: ReportRow) {
    this.count++;
    if (this.rows.length < MAX_REPORT_ROWS) this.rows.push(row);
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * Turns the raw sheet into one record per customer, plus a plain-language report.
 * Pure: the same rows, mapping and options always give the same result.
 */
export function processSales(rows: Row[], headerRow: number, mapping: ColumnMapping, options: ProcessOptions): ImportResult {
  const rules = options.rules ?? DEFAULT_RULES;
  const headers = (rows[headerRow] ?? []).map(cellText);
  const missing = missingRequiredFields(mapping);
  const emptyResult = (errors: ReportItem[]): ImportResult => ({
    customers: [],
    report: { errors, warnings: [], autoFixes: [] },
    stats: { rowsRead: 0, linesKept: 0, totalRowsRemoved: 0, repeatLinesCombined: 0, categoriesRenamed: 0, undescribedSkus: [], undescribedLines: 0, labGrownLines: 0, naturalLines: 0 },
    hasValue: mapping.value !== undefined,
  });

  if (missing.length) {
    const labels = missing.map((k) => FIELDS.find((f) => f.key === k)!.label);
    return emptyResult([{ id: "missing_columns", count: missing.length, message: `Choose a column for: ${labels.join(", ")}. These are needed to build the emails.` }]);
  }

  const get = (row: Row, key: FieldKey) => {
    const col = mapping[key];
    return col === undefined ? undefined : row[col];
  };
  const rowValues = (row: Row): Record<string, string> => {
    const v: Record<string, string> = {};
    headers.forEach((h, i) => (v[h || `Column ${i + 1}`] = cellText(row[i])));
    return v;
  };

  const totals = new Bucket();
  const missingId = new Bucket();
  const badQty = new Bucket();
  const badDate = new Bucket();
  const outside = new Bucket();
  const noDesc = new Bucket();
  let rowsRead = 0;
  let categoriesRenamed = 0;
  let labGrownLines = 0;
  let naturalLines = 0;

  interface Acc {
    names: string[];
    emails: string[];
    invalid: string[];
    reps: string[];
    items: Map<string, CustomerItem>;
    lines: number;
  }
  const accounts = new Map<string, Acc>();
  const undescribed = new Map<string, { lines: number; customers: Set<string> }>();

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => cellText(c) === "")) continue;
    rowsRead++;
    const sheetRow = r + 1;
    const accountId = cellText(get(row, "accountId"));
    const customerName = normalizeText(cellText(get(row, "customerName")));
    const sku = cellText(get(row, "sku")).toUpperCase();

    if (isTotalLabel(accountId) || isTotalLabel(customerName) || (!accountId && !sku && !customerName)) {
      totals.add({ row: sheetRow, values: rowValues(row) });
      continue;
    }
    if (!accountId || !sku) {
      missingId.add({ row: sheetRow, values: rowValues(row) });
      continue;
    }
    const qty = parseQuantity(get(row, "qty"));
    if (!Number.isFinite(qty) || qty <= 0) {
      badQty.add({ row: sheetRow, values: rowValues(row) });
      continue;
    }
    const date = parseOrderDate(get(row, "orderDate"), options.seasonStart, options.seasonEnd);
    if (!date.ok) {
      (date.reason === "unreadable" ? badDate : outside).add({ row: sheetRow, values: rowValues(row) });
      continue;
    }

    const rawCategory = cellText(get(row, "category"));
    const category = normalizeCategory(rawCategory);
    if (rawCategory && rawCategory !== category) categoriesRenamed++;
    const origin = normalizeOrigin(cellText(get(row, "origin")));
    if (origin === "Lab grown") labGrownLines++;
    if (origin === "Natural") naturalLines++;
    const name = normalizeText(cellText(get(row, "productName")));
    if (!name) {
      noDesc.add({ row: sheetRow, values: rowValues(row) });
      const u = undescribed.get(sku) ?? { lines: 0, customers: new Set<string>() };
      u.lines++;
      u.customers.add(accountId);
      undescribed.set(sku, u);
    }
    const value = mapping.value === undefined ? undefined : parseMoney(get(row, "value"));
    const emails = parseEmails(get(row, "email"));

    let acc = accounts.get(accountId);
    if (!acc) {
      acc = { names: [], emails: [], invalid: [], reps: [], items: new Map(), lines: 0 };
      accounts.set(accountId, acc);
    }
    acc.lines++;
    acc.names.push(customerName);
    acc.reps.push(cellText(get(row, "rep")));
    for (const e of emails.valid) if (!acc.emails.includes(e)) acc.emails.push(e);
    for (const e of emails.invalid) if (!acc.invalid.includes(e)) acc.invalid.push(e);

    const existing = acc.items.get(sku);
    if (existing) {
      existing.qty += qty;
      existing.lines++;
      if (value !== undefined) existing.value = (existing.value ?? 0) + value;
      if (!existing.name && name) existing.name = name;
      if (periodIndex(date.period) > periodIndex(existing.lastPeriod)) existing.lastPeriod = date.period;
    } else {
      acc.items.set(sku, { sku, name, category, origin, qty, value, lines: 1, lastPeriod: date.period });
    }
  }

  // Build customers and check emails.
  const emailOwners = new Map<string, string[]>();
  for (const [id, acc] of accounts) for (const e of acc.emails) emailOwners.set(e, [...(emailOwners.get(e) ?? []), id]);
  const generic = new Set(rules.genericLocalParts.map((g) => g.toLowerCase()));

  let linesKept = 0;
  let distinctItems = 0;
  const customers: CustomerRecord[] = [];
  for (const [accountId, acc] of accounts) {
    const items = [...acc.items.values()].sort(
      (a, b) => b.qty - a.qty || (b.value ?? 0) - (a.value ?? 0) || periodIndex(b.lastPeriod) - periodIndex(a.lastPeriod) || a.sku.localeCompare(b.sku),
    );
    linesKept += acc.lines;
    distinctItems += items.length;

    const reasons: ReviewReason[] = [];
    if (acc.emails.length > 1) reasons.push("multi_email");
    const sharedIds = [...new Set(acc.emails.flatMap((e) => emailOwners.get(e) ?? []))].filter((id) => id !== accountId);
    if (sharedIds.length) reasons.push("shared_email");
    if (acc.emails.some((e) => generic.has(e.split("@")[0]!))) reasons.push("generic_inbox");
    if (acc.invalid.length) reasons.push("invalid_email");

    customers.push({
      accountId,
      name: displayCompanyName(mostCommon(acc.names)) || accountId,
      emails: acc.emails,
      rep: mostCommon(acc.reps),
      items,
      units: items.reduce((s, i) => s + i.qty, 0),
      lines: acc.lines,
      check: acc.emails.length === 0 ? "no_email" : reasons.length ? "review" : "ready",
      reasons: acc.emails.length === 0 ? reasons.filter((r) => r === "invalid_email") : reasons,
      sharedWith: sharedIds.map((id) => ({ accountId: id, name: displayCompanyName(mostCommon(accounts.get(id)!.names)) || id })),
      invalidEmails: acc.invalid,
      large: items.length > rules.largeAccountProducts,
    });
  }
  customers.sort((a, b) => a.name.localeCompare(b.name));

  const errors: ReportItem[] = [];
  const warnings: ReportItem[] = [];
  const autoFixes: ReportItem[] = [];
  const warn = (id: string, b: Bucket, message: string) => b.count && warnings.push({ id, count: b.count, rows: b.rows, message });

  if (customers.length === 0) {
    errors.push({ id: "no_lines", count: 0, message: rowsRead === 0 ? "The sheet has no data rows under the header." : "No usable sales lines were found. Check the column choices and the season dates." });
  }
  warn("missing_id", missingId, `${plural(missingId.count, "row")} ${missingId.count === 1 ? "has" : "have"} no customer ID or SKU and ${missingId.count === 1 ? "was" : "were"} left out. Download them to fix in Power BI.`);
  warn("bad_qty", badQty, `${plural(badQty.count, "row")} with zero, negative or unreadable quantity (returns or cancellations) ${badQty.count === 1 ? "was" : "were"} left out.`);
  warn("bad_date", badDate, `${plural(badDate.count, "row")} ${badDate.count === 1 ? "has" : "have"} a date we couldn't read and ${badDate.count === 1 ? "was" : "were"} left out.`);
  warn("outside_season", outside, `${plural(outside.count, "row")} ${outside.count === 1 ? "is" : "are"} outside the season dates and ${outside.count === 1 ? "was" : "were"} left out.`);
  if (noDesc.count) {
    warnings.push({ id: "no_description", count: noDesc.count, rows: noDesc.rows, message: `${plural(undescribed.size, "product")} (${plural(noDesc.count, "sales line")}) ${undescribed.size === 1 ? "has" : "have"} no description, so there is nothing to show in the email.` });
  }

  if (totals.count) autoFixes.push({ id: "total_rows", count: totals.count, rows: totals.rows, message: `Removed ${totals.count === 1 ? 'the "Total" row' : `${totals.count} total rows`}.` });
  const repeat = linesKept - distinctItems;
  if (repeat > 0) autoFixes.push({ id: "repeat_lines", count: repeat, message: `Combined ${plural(repeat, "repeat line")} for the same customer and product across months.` });
  if (categoriesRenamed) autoFixes.push({ id: "categories", count: categoriesRenamed, message: "Standardized category names." });

  return {
    customers,
    report: { errors, warnings, autoFixes },
    stats: {
      rowsRead,
      linesKept,
      totalRowsRemoved: totals.count,
      repeatLinesCombined: Math.max(0, repeat),
      categoriesRenamed,
      undescribedSkus: [...undescribed].map(([sku, u]) => ({ sku, lines: u.lines, customers: u.customers.size })).sort((a, b) => b.lines - a.lines),
      undescribedLines: noDesc.count,
      labGrownLines,
      naturalLines,
    },
    hasValue: mapping.value !== undefined,
  };
}
