import type { Cell } from "./sheet";
import { cellText } from "./sheet";

export type Origin = "Lab grown" | "Natural";

/** Known jewelry categories, singular or plural, any case -> display name. */
const CATEGORY_NAMES: Record<string, string> = {
  bracelet: "Bracelets", stud: "Studs", earring: "Earrings", band: "Bands", hoop: "Hoops",
  necklace: "Necklaces", ring: "Rings", pendant: "Pendants", bangle: "Bangles", chain: "Chains",
  anklet: "Anklets", charm: "Charms", brooch: "Brooches", set: "Sets", misc: "Other", other: "Other",
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeCategory(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "Other";
  const singular = key.replace(/(es|s)$/, "");
  return CATEGORY_NAMES[key] ?? CATEGORY_NAMES[singular] ?? CATEGORY_NAMES[key.replace(/s$/, "")] ?? titleCase(key);
}

export function normalizeOrigin(raw: string): Origin | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (/^(lab|lgd|lab[\s-]*grown|lab[\s-]*created|cvd|hpht)/.test(v)) return "Lab grown";
  if (/^(natural|nat|mined|earth)/.test(v)) return "Natural";
  return undefined;
}

const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export interface ParsedEmails {
  valid: string[];
  invalid: string[];
}

/** Splits "a@x.com; b@y.com" and lower-cases each address. */
export function parseEmails(cell: Cell): ParsedEmails {
  const parts = cellText(cell)
    .split(/[;,\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) (EMAIL_RE.test(p) ? valid : invalid).push(p);
  return { valid: [...new Set(valid)], invalid };
}

export function parseQuantity(cell: Cell): number {
  if (typeof cell === "number") return cell;
  const n = Number(cellText(cell).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function parseMoney(cell: Cell): number | undefined {
  if (typeof cell === "number") return cell;
  const t = cellText(cell).replace(/[^0-9.-]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Collapses whitespace so "5 ct  TENNIS" and "5 ct TENNIS" count as one style. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Rows like "Total" / "Grand total" / "Subtotal" exported under the data. */
export function isTotalLabel(text: string): boolean {
  return /^(grand\s*|sub\s*)?totals?\b/i.test(text.trim());
}

const UPPER_WORDS = new Set(["LLC", "LLP", "LP", "PLC", "USA", "US", "UK", "II", "III", "IV", "NY", "LA", "DC", "CJ", "JC", "OBX"]);
const LOWER_WORDS = new Set(["and", "of", "the", "for", "at", "by", "de", "del", "la", "dba"]);

function capitalizeWord(word: string, index: number): string {
  const bare = word.replace(/[^A-Za-z]/g, "");
  if (UPPER_WORDS.has(bare.toUpperCase()) && bare.length > 1) return word.toUpperCase();
  const lower = word.toLowerCase();
  if (index > 0 && LOWER_WORDS.has(lower)) return lower;
  // Capitalise the first letter only, so "ADLER'S" -> "Adler's".
  return lower.replace(/[a-z]/, (c) => c.toUpperCase());
}

/**
 * Friendly company name for screens and emails.
 * Uses the trading name after "DBA" and title-cases names exported in capitals.
 */
export function displayCompanyName(raw: string): string {
  let name = normalizeText(raw);
  const dba = name.match(/\b(?:d\/?b\/?a|doing business as)\b[\s:.-]*(.+)$/i);
  if (dba?.[1]) name = dba[1].trim();
  const letters = name.replace(/[^A-Za-z]/g, "");
  const mostlyUpper = letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8;
  return mostlyUpper ? name.split(" ").map(capitalizeWord).join(" ") : name;
}
