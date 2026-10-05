/** Abbreviations seen in style descriptions. Unknown words are kept, title-cased. */
const WORDS: Record<string, string> = {
  rd: "Round", ov: "Oval", pr: "Princess", em: "Emerald", cu: "Cushion", ps: "Pear", mq: "Marquise", ht: "Heart", ash: "Asscher", rad: "Radiant",
  "2p": "2-Prong", "3p": "3-Prong", "4p": "4-Prong", "6p": "6-Prong", wt: "Weight", hv: "Heavy", fw: "Full-Way", hw: "Half-Way",
};
const KEEP_LOWER = new Set(["ct", "tw", "of", "and", "with", "in"]);

/**
 * Readable name for the email until the catalog provides one:
 * "3ct RD 4P CLASSIC TENNIS BRACELET" -> "3 ct Round 4-Prong Classic Tennis Bracelet".
 */
export function displayProductName(raw: string): string {
  const spaced = raw
    .replace(/-PB\b/gi, "")
    .replace(/(\d)\s*ct\b/gi, "$1 ct")
    .replace(/\s+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .map((w) => {
      const lower = w.toLowerCase();
      if (WORDS[lower]) return WORDS[lower];
      if (KEEP_LOWER.has(lower)) return lower;
      if (/^[\d./]+$/.test(w)) return w;
      return lower.replace(/^([^a-z]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
    })
    .join(" ");
}

const METALS: Record<string, string> = { W: "white gold", Y: "yellow gold", R: "rose gold" };

/** Metal from the SKU suffix: "B401300-14WD" -> "14K white gold", "B401400-PTA" -> "Platinum". */
export function metalFromSku(sku: string): string | undefined {
  const suffix = sku.split("-")[1]?.toUpperCase() ?? "";
  const gold = suffix.match(/^(9|10|14|18|22)([WYR])/);
  if (gold) return `${gold[1]}K ${METALS[gold[2]!]}`;
  if (suffix.startsWith("PT")) return "Platinum";
  if (suffix.startsWith("SS")) return "Sterling silver";
  return undefined;
}
