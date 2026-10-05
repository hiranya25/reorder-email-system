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
