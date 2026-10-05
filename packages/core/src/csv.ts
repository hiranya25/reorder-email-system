import type { ReportRow } from "./import/types";

function escape(cell: string): string {
  // Leading = + - @ would run as a formula when opened in Excel.
  const safe = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}

/** Report rows -> CSV with the sheet row number first, then the original columns. */
export function reportRowsToCsv(rows: ReportRow[]): string {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.values)))];
  return toCsv([["Sheet row", ...headers], ...rows.map((r) => [String(r.row), ...headers.map((h) => r.values[h] ?? "")])]);
}
