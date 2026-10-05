import { describe, expect, it } from "vitest";
import { detectHeaderRow, fromNamedMapping, headerSignature, missingRequiredFields, normalizeHeader, suggestMapping, toNamedMapping } from "./sheet";

const POWER_BI = ["Account_id", "Customer Name", "email", "trans_dt - Month_2025", "origin", "Trans_qty", "Item Category", "item_id", "style_desc", "Assigned Sales Rep"];

describe("headers", () => {
  it("normalizes punctuation and case", () => {
    expect(normalizeHeader("trans_dt - Month_2025")).toBe("trans dt month 2025");
  });

  it("maps a Power BI style export", () => {
    const m = suggestMapping(POWER_BI);
    expect(m).toEqual({ accountId: 0, customerName: 1, email: 2, orderDate: 3, origin: 4, qty: 5, category: 6, sku: 7, productName: 8, rep: 9 });
    expect(missingRequiredFields(m)).toEqual([]);
  });

  it("maps renamed and reordered columns", () => {
    const m = suggestMapping(["Order Date", "SKU", "Description", "Quantity", "Company", "Customer ID", "Email Address", "Net Sales"]);
    expect(m).toMatchObject({ orderDate: 0, sku: 1, productName: 2, qty: 3, customerName: 4, accountId: 5, email: 6, value: 7 });
  });

  it("reports missing required columns", () => {
    expect(missingRequiredFields(suggestMapping(["Customer", "Qty"]))).toEqual(["accountId", "orderDate", "sku", "productName"]);
  });

  it("finds the header row below a report title", () => {
    expect(detectHeaderRow([["Sales report Oct–Jan"], [], POWER_BI, ["1", "A"]])).toBe(2);
  });

  it("round-trips a mapping by header name when columns move", () => {
    const named = toNamedMapping(suggestMapping(POWER_BI), POWER_BI);
    const moved = [...POWER_BI].reverse();
    expect(fromNamedMapping(named, moved).sku).toBe(moved.indexOf("item_id"));
    expect(headerSignature(moved)).toBe(headerSignature(POWER_BI));
  });
});
