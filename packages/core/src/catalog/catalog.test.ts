import { describe, expect, it } from "vitest";
import { buildIssues } from "../issues";
import type { CustomerItem, CustomerRecord, ImportResult } from "../import/types";
import { processCatalog, parseStock } from "./process";
import { picksFor, recommendationsComplete, segmentOf, segmentSummaries } from "./recommendations";
import { indexCatalog, productCheck, resolveItem } from "./resolve";
import { catalogTemplateCsv } from "./template";
import { suggestMapping } from "../import/sheet";
import { CATALOG_FIELDS } from "./fields";
import { EMPTY_EDITS, type Product, type ProductEdits } from "./types";

const item = (sku: string, name: string, qty: number, category = "Bracelets"): CustomerItem => ({ sku, name, category, origin: "Natural", qty, lines: 1, lastPeriod: { year: 2025, month: 12 } });
const customer = (id: string, items: CustomerItem[]): CustomerRecord => ({ accountId: id, name: `C${id}`, emails: [`a${id}@x.com`], rep: "", items, units: 0, lines: 0, check: "ready", reasons: [], sharedWith: [], invalidEmails: [], large: false });
const product = (sku: string, over: Partial<Product> = {}): Product => ({ sku, name: `Name ${sku}`, imageUrl: `https://img/${sku}.jpg`, productUrl: `https://shop/${sku}`, isNew: false, ...over });

describe("processCatalog", () => {
  const H = ["Variant SKU", "Title", "Image Src", "Product URL", "Available", "New this season", "Replacement SKU"];
  const rows = [
    H,
    ["b1-14w", "Tennis Bracelet", "https://cdn/b1.jpg", "https://shop/b1", "yes", "no", ""],
    ["B2-14W", "Old Bracelet", "ftp://bad", "https://shop/b2", "0", "", "B3-14W"],
    ["", "No sku", "", "", "", "", ""],
    ["B3-14W", "New Bracelet", "https://cdn/b3.jpg", "", "12", "yes", ""],
    ["B1-14W", "Tennis Bracelet v2", "https://cdn/b1.jpg", "", "yes", "", ""],
  ];
  const mapping = suggestMapping(H, CATALOG_FIELDS);
  const { products, report } = processCatalog(rows, 0, mapping);

  it("maps typical store export headers", () => {
    expect(mapping).toEqual({ sku: 0, name: 1, imageUrl: 2, productUrl: 3, inStock: 4, isNew: 5, successorSku: 6 });
  });
  it("reads products, stock and flags", () => {
    expect(products.map((p) => [p.sku, p.name, p.inStock, p.isNew, p.successorSku ?? null])).toEqual([
      ["B1-14W", "Tennis Bracelet v2", true, false, null],
      ["B2-14W", "Old Bracelet", false, false, "B3-14W"],
      ["B3-14W", "New Bracelet", true, true, null],
    ]);
    expect(products[1]!.imageUrl).toBeUndefined();
  });
  it("reports skipped, duplicate and bad-link rows", () => {
    expect(report.warnings.map((w) => [w.id, w.count])).toEqual([["no_sku", 1], ["duplicate_sku", 1], ["bad_url", 1]]);
  });
  it("parses stock values", () => {
    expect([parseStock("In Stock"), parseStock("sold out"), parseStock(3), parseStock("0"), parseStock("")]).toEqual([true, false, true, false, undefined]);
  });
});

describe("resolving items", () => {
  const catalog = indexCatalog([product("A"), product("OLD", { inStock: false, successorSku: "NEW" }), product("NEW"), product("GONE", { inStock: false }), product("NOIMG", { imageUrl: undefined, name: "" })]);
  const edits: ProductEdits = { hidden: ["H"], successor: {}, displayName: { A: "Better A" } };

  it("applies hide, replacement, out of stock and names", () => {
    expect(resolveItem(item("H", "x", 1), catalog, edits).excluded).toBe("hidden");
    expect(resolveItem(item("OLD", "x", 1), catalog, edits)).toMatchObject({ sku: "NEW", name: "Name NEW", replacedFrom: "OLD" });
    expect(resolveItem(item("GONE", "x", 1), catalog, edits).excluded).toBe("out_of_stock");
    expect(resolveItem(item("A", "x", 1), catalog, edits).name).toBe("Better A");
    expect(resolveItem(item("NOIMG", "3ct RD BAND", 1), catalog, edits)).toMatchObject({ name: "3 ct Round Band", imageUrl: undefined });
    expect(resolveItem(item("MISSING", "", 1), catalog, edits).excluded).toBe("no_name");
    const shouting = indexCatalog([product("S", { name: "4CT RD 4P CLASSIC TENNIS BRACELET" })]);
    expect(resolveItem(item("S", "", 1), shouting, EMPTY_EDITS).name).toBe("4 ct Round 4-Prong Classic Tennis Bracelet");
    expect(resolveItem(item("GONE", "x", 1), catalog, { ...EMPTY_EDITS, successor: { GONE: "A" } })).toMatchObject({ sku: "A", replacedFrom: "GONE" });
  });

  it("lists problems per purchased product", () => {
    const rows = productCheck([customer("1", [item("A", "a", 5), item("GONE", "g", 3), item("NOIMG", "n", 2), item("MISSING", "", 1)])], catalog, EMPTY_EDITS, 3);
    const bySku = Object.fromEntries(rows.map((r) => [r.sku, r.problems]));
    expect(bySku).toEqual({ A: [], GONE: ["out_of_stock"], NOIMG: ["no_image"], MISSING: ["not_in_catalog", "no_name"] });
    expect(rows.find((r) => r.sku === "A")!.shownTo).toBe(1);
  });

  it("turns catalog problems into Overview issues", () => {
    const result = { customers: [customer("1", [item("A", "a", 5), item("NOIMG", "n", 2), item("MISSING", "", 1)])], report: { errors: [], warnings: [], autoFixes: [] }, stats: { undescribedSkus: [{ sku: "MISSING", lines: 1, customers: 1 }], undescribedLines: 1 } } as unknown as ImportResult;
    const ids = buildIssues(result, { catalogUploaded: true, largeAccountProducts: 20, catalog }).map((i) => i.id);
    expect(ids).toEqual(["no_description", "no_image"]);
  });
});

describe("recommendations", () => {
  const catalog = indexCatalog([product("N1", { isNew: true }), product("N2", { isNew: true }), product("N3", { isNew: true, inStock: false }), product("A")]);
  const c1 = customer("1", [item("A", "a", 5)]);
  const c2 = customer("2", [item("S", "s", 2, "Studs")]);

  it("groups customers by origin and top category", () => {
    expect(segmentOf(c1)).toBe("Natural · Bracelets");
    const s = segmentSummaries([c1, c2], { bySegment: { "Natural · Bracelets": ["N1", "N2", "N3"] }, byCustomer: {} });
    expect(s.map((x) => [x.key, x.customers, x.filled])).toEqual([["Natural · Bracelets", 1, 3], ["Natural · Studs", 1, 0]]);
    expect(recommendationsComplete(s)).toBe(false);
    expect(recommendationsComplete(segmentSummaries([c1], { bySegment: { "Natural · Bracelets": ["N1", "N2", "A"] }, byCustomer: {} }))).toBe(true);
  });

  it("skips picks already bought or out of stock, and honours overrides", () => {
    const picks = { bySegment: { "Natural · Bracelets": ["N1", "A", "N3"] }, byCustomer: { "2": ["N2", "", ""] } };
    expect(picksFor(c1, picks, catalog, EMPTY_EDITS).map((p) => p.sku)).toEqual(["N1"]);
    expect(picksFor(c2, picks, catalog, EMPTY_EDITS).map((p) => p.sku)).toEqual(["N2"]);
  });

  it("builds a catalog template from purchased SKUs", () => {
    const csv = catalogTemplateCsv([c1, c2]);
    expect(csv.split("\r\n")[0]).toBe("SKU,Product name,Image URL,Product URL,Category,Origin,Price,In stock,New this season,Replacement SKU");
    expect(csv).toContain("A,A,,,Bracelets,Natural,,yes,no,");
  });
});

describe("suggestPicks", () => {
  it("prefers the group's category and origin, keeps existing picks", async () => {
    const { suggestPicks } = await import("./recommendations");
    const products = [
      product("LAB-BR", { isNew: true, category: "Bracelets", origin: "Lab grown" }),
      product("NAT-BR", { isNew: true, category: "Bracelets", origin: "Natural" }),
      product("NAT-ST", { isNew: true, category: "Studs", origin: "Natural" }),
      product("OLD-BR", { isNew: false, category: "Bracelets", origin: "Natural" }),
      product("OOS-BR", { isNew: true, category: "Bracelets", origin: "Natural", inStock: false }),
    ];
    expect(suggestPicks("Natural · Bracelets", [], products, EMPTY_EDITS)).toEqual(["NAT-BR", "LAB-BR", "NAT-ST"]);
    expect(suggestPicks("Natural · Bracelets", ["", "X", ""], products, EMPTY_EDITS)).toEqual(["NAT-BR", "X", "LAB-BR"]);
  });
});
