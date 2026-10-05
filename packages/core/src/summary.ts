import type { ImportResult } from "./import/types";
import type { CampaignSummary } from "./types";

const TOP_CATEGORIES = 8;

/** A style is the SKU before its metal / certificate suffix: "LB401700-14YQA" -> "LB401700". */
export function styleCode(sku: string): string {
  return sku.split("-")[0] ?? sku;
}

export function summarize(result: ImportResult): CampaignSummary {
  const { customers, stats } = result;
  const skus = new Set<string>();
  const styles = new Set<string>();
  const reps = new Set<string>();
  const byCategory = new Map<string, number>();
  let one = 0, two = 0, threePlus = 0;

  for (const c of customers) {
    if (c.rep) reps.add(c.rep);
    const n = c.items.length;
    if (n === 1) one++;
    else if (n === 2) two++;
    else if (n >= 3) threePlus++;
    const cats = new Set<string>();
    for (const i of c.items) {
      skus.add(i.sku);
      styles.add(styleCode(i.sku));
      cats.add(i.category);
    }
    for (const cat of cats) byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  const originLines = stats.labGrownLines + stats.naturalLines;
  return {
    lines: stats.linesKept,
    customers: customers.length,
    ready: customers.filter((c) => c.check === "ready").length,
    review: customers.filter((c) => c.check === "review").length,
    noEmail: customers.filter((c) => c.check === "no_email").length,
    units: customers.reduce((s, c) => s + c.units, 0),
    skus: skus.size,
    styles: styles.size,
    reps: reps.size,
    categories: [...byCategory]
      .filter(([name]) => name !== "Other")
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_CATEGORIES)
      .map(([name, customers]) => ({ name, customers })),
    productsPerCustomer: { one, two, threePlus },
    origin: originLines
      ? { labGrown: stats.labGrownLines / originLines, natural: stats.naturalLines / originLines }
      : { labGrown: 0, natural: 0 },
  };
}
