import { FIELDS, type FieldDef, type FieldKey } from "./fields";

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

/** Column index in the sheet for each field. Missing key = not in the file. */
export type ColumnMapping<K extends string = FieldKey> = Partial<Record<K, number>>;

export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** "trans_dt - Month_2025" -> "trans dt month 2025" */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-./()#:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreHeader(header: string, aliases: string[]): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const alias of aliases) {
    if (h === alias) return 3;
    // Whole-word containment, e.g. "trans dt month 2025" contains "trans dt".
    if (new RegExp(`(^| )${alias}( |$)`).test(h)) best = Math.max(best, 2);
  }
  return best;
}

/** Picks the row (within the first 20) whose cells look most like column headers. */
export function detectHeaderRow(rows: Row[], fields: FieldDef<string>[] = FIELDS): number {
  let bestRow = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] ?? [];
    let score = 0;
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      if (fields.some((f) => scoreHeader(cell, f.aliases) > 0)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  if (bestRow >= 0) return bestRow;
  const firstNonEmpty = rows.findIndex((row) => row.some((c) => cellText(c) !== ""));
  return Math.max(0, firstNonEmpty);
}

/** Suggests a column for each field: best header score wins, each column is used once. */
export function suggestMapping<K extends string = FieldKey>(headers: string[], fields: FieldDef<K>[] = FIELDS as unknown as FieldDef<K>[]): ColumnMapping<K> {
  const candidates: { key: K; col: number; score: number }[] = [];
  for (const field of fields) {
    headers.forEach((header, col) => {
      const score = scoreHeader(header, field.aliases);
      if (score > 0) candidates.push({ key: field.key, col, score });
    });
  }
  // Higher scores first; ties go to the field listed first, then the leftmost column.
  const fieldOrder = (k: K) => fields.findIndex((f) => f.key === k);
  candidates.sort((a, b) => b.score - a.score || fieldOrder(a.key) - fieldOrder(b.key) || a.col - b.col);

  const mapping: ColumnMapping<K> = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.key] !== undefined || usedCols.has(c.col)) continue;
    mapping[c.key] = c.col;
    usedCols.add(c.col);
  }
  return mapping;
}

export function missingRequiredFields<K extends string = FieldKey>(mapping: ColumnMapping<K>, fields: FieldDef<K>[] = FIELDS as unknown as FieldDef<K>[]): K[] {
  return fields.filter((f) => f.required && mapping[f.key] === undefined).map((f) => f.key);
}

/** Stable key for a set of headers, so a saved mapping is reused when the same export comes back. */
export function headerSignature(headers: string[]): string {
  return headers.map(normalizeHeader).filter(Boolean).sort().join("|");
}

/** Mapping stored by header name, so it survives columns being reordered. */
export type NamedMapping<K extends string = FieldKey> = Partial<Record<K, string>>;

export function toNamedMapping<K extends string = FieldKey>(mapping: ColumnMapping<K>, headers: string[]): NamedMapping<K> {
  const named: NamedMapping<K> = {};
  for (const [key, col] of Object.entries(mapping) as [K, number][]) {
    const header = headers[col];
    if (header) named[key] = header;
  }
  return named;
}

export function fromNamedMapping<K extends string = FieldKey>(named: NamedMapping<K>, headers: string[]): ColumnMapping<K> {
  const byName = new Map(headers.map((h, i) => [normalizeHeader(h), i]));
  const mapping: ColumnMapping<K> = {};
  for (const [key, header] of Object.entries(named) as [K, string][]) {
    const col = byName.get(normalizeHeader(header));
    if (col !== undefined) mapping[key] = col;
  }
  return mapping;
}
