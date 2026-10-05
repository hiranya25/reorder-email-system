import { describe, expect, it } from "vitest";
import { DEMO_CAMPAIGN, demoSheet } from "./demo";
import { detectHeaderRow, processSales, suggestMapping, cellText } from "./index";
import { summarize } from "./summary";

describe("demo dataset", () => {
  it("is deterministic and exercises every review case", () => {
    const rows = demoSheet();
    expect(demoSheet()).toEqual(rows);
    const h = detectHeaderRow(rows);
    const result = processSales(rows, h, suggestMapping(rows[h]!.map(cellText)), { seasonStart: DEMO_CAMPAIGN.seasonStart, seasonEnd: DEMO_CAMPAIGN.seasonEnd });
    const s = summarize(result);
    expect(result.report.errors).toEqual([]);
    expect(s.ready).toBeGreaterThan(s.review);
    expect(s.review).toBeGreaterThan(0);
    expect(s.noEmail).toBeGreaterThan(0);
    expect(result.customers.some((c) => c.large)).toBe(true);
    const reasons = new Set(result.customers.flatMap((c) => c.reasons));
    expect([...reasons].sort()).toEqual(["generic_inbox", "multi_email", "shared_email"]);
    expect(result.stats.totalRowsRemoved).toBe(1);
    expect(result.stats.undescribedSkus.length).toBeGreaterThan(0);
  });
});

describe("demo catalog", () => {
  it("covers purchased SKUs and adds new-season items with every problem type", async () => {
    const { demoCatalog } = await import("./demo");
    const { productCheck, indexCatalog } = await import("./catalog/resolve");
    const { EMPTY_EDITS } = await import("./catalog/types");
    const rows = demoSheet();
    const result = processSales(rows, 0, suggestMapping(rows[0]!.map(cellText)), { seasonStart: DEMO_CAMPAIGN.seasonStart, seasonEnd: DEMO_CAMPAIGN.seasonEnd });
    const products = demoCatalog(result.customers);
    expect(products.filter((p) => p.isNew).length).toBeGreaterThanOrEqual(9);
    const problems = new Set(productCheck(result.customers, indexCatalog(products), EMPTY_EDITS, 3).flatMap((r) => r.problems));
    expect([...problems].sort()).toEqual(["no_image", "no_name", "out_of_stock", "replaced"]);
  });
});
