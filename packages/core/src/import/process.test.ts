import { describe, expect, it } from "vitest";
import { buildIssues } from "../issues";
import { summarize } from "../summary";
import { processSales } from "./process";
import { suggestMapping, type Row } from "./sheet";

const H = ["Account_id", "Customer Name", "email", "Month", "origin", "Qty", "Item Category", "item_id", "style_desc", "Sales Rep"];
const opts = { seasonStart: "2025-10-01", seasonEnd: "2026-01-31" };

function run(rows: Row[]) {
  const sheet = [H, ...rows];
  return processSales(sheet, 0, suggestMapping(H), opts);
}

describe("processSales", () => {
  const result = run([
    ["1", "ALPHA JEWELERS", "anna@alpha.com", "October", "Lab Grown", 2, "BRACELET", "LB100-14W", "Tennis Bracelet", "JO"],
    ["1", "ALPHA JEWELERS", "anna@alpha.com", "December", "Lab Grown", 3, "BRACELET", "LB100-14W", "Tennis Bracelet", "JO"], // repeat line
    ["1", "ALPHA JEWELERS", "anna@alpha.com", "November", "Natural", 1, "rings", "R200-PT", "", "JO"], // no description
    ["2", "Beta Gems", "info@beta.com", "January", "Natural", 1, "STUDS", "S300-14Y", "Studs", "MA"], // generic
    ["3", "Gamma Co", "x@gamma.com;y@gamma.com", "November", "Natural", 1, "STUDS", "S300-14Y", "Studs", "MA"], // two emails
    ["4", "Delta", "shared@delta.com", "November", "Natural", 1, "BAND", "B1-14W", "Band", "MA"],
    ["5", "Delta Branch 1", "shared@delta.com", "November", "Natural", 1, "BAND", "B1-14W", "Band", "MA"], // shared
    ["6", "Epsilon", "", "October", "Natural", 1, "BAND", "B1-14W", "Band", "MA"], // no email
    ["", "No Id Inc", "a@b.com", "October", "Natural", 1, "BAND", "B1-14W", "Band", "MA"], // missing id
    ["7", "Zeta", "z@zeta.com", "October", "Natural", -1, "BAND", "B1-14W", "Band", "MA"], // return
    ["8", "Eta", "e@eta.com", "June", "Natural", 1, "BAND", "B1-14W", "Band", "MA"], // outside season
    [],
    ["Total", null, null, null, null, 12, null, null, null, null],
  ]);

  it("groups lines by customer and product", () => {
    const alpha = result.customers.find((c) => c.accountId === "1")!;
    expect(alpha.items.map((i) => [i.sku, i.qty, i.lines])).toEqual([["LB100-14W", 5, 2], ["R200-PT", 1, 1]]);
    expect(alpha.name).toBe("Alpha Jewelers");
    expect(alpha.items[1]!.category).toBe("Rings");
    expect(result.stats.repeatLinesCombined).toBe(1);
  });

  it("checks emails", () => {
    const check = Object.fromEntries(result.customers.map((c) => [c.accountId, [c.check, c.reasons]]));
    expect(check).toEqual({
      "1": ["ready", []],
      "2": ["review", ["generic_inbox"]],
      "3": ["review", ["multi_email"]],
      "4": ["review", ["shared_email"]],
      "5": ["review", ["shared_email"]],
      "6": ["no_email", []],
    });
    expect(result.customers.find((c) => c.accountId === "4")!.sharedWith).toEqual([{ accountId: "5", name: "Delta Branch 1" }]);
  });

  it("reports what was left out or fixed, with row numbers", () => {
    const w = Object.fromEntries(result.report.warnings.map((x) => [x.id, x.count]));
    expect(w).toEqual({ missing_id: 1, bad_qty: 1, outside_season: 1, no_description: 1 });
    expect(result.report.warnings.find((x) => x.id === "missing_id")!.rows![0]!.row).toBe(10);
    expect(result.report.autoFixes.map((f) => f.id)).toEqual(["total_rows", "repeat_lines", "categories"]);
    expect(result.report.errors).toEqual([]);
  });

  it("summarizes for the Overview", () => {
    const s = summarize(result);
    expect(s).toMatchObject({ customers: 6, ready: 1, review: 4, noEmail: 1, lines: 8, units: 11, skus: 4, styles: 4, reps: 2 });
    expect(s.productsPerCustomer).toEqual({ one: 5, two: 1, threePlus: 0 });
    expect(s.categories[0]).toEqual({ name: "Bands", customers: 3 });
  });

  it("builds issues with downloads", () => {
    const issues = buildIssues(result, { catalogUploaded: false, largeAccountProducts: 20 });
    expect(issues.map((i) => i.id)).toEqual(["catalog", "no_description", "generic", "shared:4|5", "multi:3", "import:missing_id", "import:bad_qty", "import:outside_season", "auto_fixed"]);
    expect(issues.find((i) => i.id === "shared:4|5")!.message).toBe("Delta and Delta Branch 1 share one email. Each gets its own email unless you exclude one.");
    expect(issues.find((i) => i.id === "no_description")!.action!.download!.csv).toContain("R200-PT,1,1");
    expect(issues.at(-1)!.message).toBe('Removed the "Total" row, combined 1 repeat line for the same customer and product across months, standardized category names.');
  });

  it("stops when a required column is not chosen", () => {
    const r = processSales([H], 0, { accountId: 0 }, opts);
    expect(r.report.errors[0]!.id).toBe("missing_columns");
    expect(r.customers).toEqual([]);
  });

  it("flags large accounts", () => {
    const rows: Row[] = Array.from({ length: 21 }, (_, i) => ["9", "Big", "b@big.com", "October", "Natural", 1, "BAND", `SKU${i}`, "Band", "MA"]);
    expect(run(rows).customers[0]!.large).toBe(true);
    expect(run(rows.slice(0, 20)).customers[0]!.large).toBe(false);
  });
});

describe("issues after review", () => {
  it("drops review items for decided accounts", () => {
    const H2 = ["Account_id", "Customer Name", "email", "Month", "Qty", "item_id", "style_desc"];
    const r = processSales([H2, ["2", "Beta", "info@beta.com", "October", 1, "S1", "Studs"]], 0, suggestMapping(H2), opts);
    const ids = (decided: string[]) => buildIssues(r, { catalogUploaded: true, largeAccountProducts: 20, decided: new Set(decided) }).map((i) => i.id);
    expect(ids([])).toContain("generic");
    expect(ids(["2"])).not.toContain("generic");
  });
});
