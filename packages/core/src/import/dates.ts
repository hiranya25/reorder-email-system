import { cellText, type Cell } from "./sheet";

export interface Period {
  year: number;
  /** 1..12 */
  month: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthFromName(text: string): number | undefined {
  const i = MONTHS.indexOf(text.slice(0, 3).toLowerCase());
  return i === -1 ? undefined : i + 1;
}

export function periodIndex(p: Period): number {
  return p.year * 12 + (p.month - 1);
}

function isoToPeriod(iso: string): Period {
  const [y, m] = iso.split("-").map(Number);
  return { year: y ?? 1970, month: m ?? 1 };
}

/** Excel stores dates as days since 1899-12-30. */
function fromExcelSerial(serial: number): Period {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export type ParsedDate = { ok: true; period: Period } | { ok: false; reason: "unreadable" | "outside_season" };

/**
 * Reads an order date or month and places it inside the season window.
 * A bare month ("December") gets the year that puts it inside the window.
 */
export function parseOrderDate(cell: Cell, seasonStart: string, seasonEnd: string): ParsedDate {
  const start = periodIndex(isoToPeriod(seasonStart));
  const end = periodIndex(isoToPeriod(seasonEnd));
  const inWindow = (p: Period): ParsedDate =>
    periodIndex(p) >= start && periodIndex(p) <= end ? { ok: true, period: p } : { ok: false, reason: "outside_season" };

  if (cell instanceof Date) return inWindow({ year: cell.getUTCFullYear(), month: cell.getUTCMonth() + 1 });
  if (typeof cell === "number") {
    // 202512 style period codes, otherwise an Excel serial date.
    if (cell >= 190001 && cell <= 299912) return inWindow({ year: Math.floor(cell / 100), month: cell % 100 });
    if (cell > 20000 && cell < 80000) return inWindow(fromExcelSerial(cell));
    return { ok: false, reason: "unreadable" };
  }

  const text = cellText(cell);
  if (!text) return { ok: false, reason: "unreadable" };

  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/))) return inWindow({ year: +m[1]!, month: +m[2]! });
  if ((m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/))) {
    // Assume month/day/year (US export); fall back to day/month when the first number can't be a month.
    const a = +m[1]!, b = +m[2]!, y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
    return inWindow({ year: y, month: a <= 12 ? a : b });
  }
  if ((m = text.match(/^([a-z]{3,9})[\s\-',]*(\d{2,4})?$/i))) {
    const month = monthFromName(m[1]!);
    if (!month) return { ok: false, reason: "unreadable" };
    if (m[2]) return inWindow({ year: m[2].length === 2 ? 2000 + +m[2] : +m[2], month });
    // Bare month: try each year in the window.
    for (let y = Math.floor(start / 12); y <= Math.floor(end / 12); y++) {
      const p = { year: y, month };
      if (periodIndex(p) >= start && periodIndex(p) <= end) return { ok: true, period: p };
    }
    return { ok: false, reason: "outside_season" };
  }
  return { ok: false, reason: "unreadable" };
}
