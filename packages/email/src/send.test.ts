import { indexCatalog, EMPTY_EDITS, EMPTY_PICKS, type CustomerRecord, type MappingRow } from "@reorder/core";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BRAND } from "./model";
import { buildSendList, mailchimpImportCsv, reorderUrlFor } from "./send";

const customer = (id: string, items: string[], over: Partial<CustomerRecord> = {}): CustomerRecord => ({
  accountId: id, name: `Store ${id}`, emails: [`buyer${id}@x.com`], rep: "", units: 1, lines: 1, check: "ready", reasons: [], sharedWith: [], invalidEmails: [], large: false,
  items: items.map((name, i) => ({ sku: `S${id}${i}-14W`, name, category: "Bands", qty: 3 - i, lines: 1, lastPeriod: { year: 2025, month: 11 } })),
  ...over,
});
const row = (c: CustomerRecord, status: MappingRow["status"], emails = c.emails): MappingRow => ({ customer: c, status, emails: status === "approved" ? emails : [], source: "manual" });
const ctx = { campaignName: "Holiday 2026 Reorder", seasonStart: "2025-10-01", catalog: indexCatalog([]), edits: EMPTY_EDITS, picks: EMPTY_PICKS, brand: PLACEHOLDER_BRAND, reorder: { mode: "url" as const, template: "https://store.example/reorder?c={CUST_ID}&s={SEASON}" } };

describe("send list", () => {
  const rows = [
    row(customer("1", ["Band A", "Band B"]), "approved", ["a@x.com", "b@x.com"]),
    row(customer("2", ["Band"]), "excluded"),
    row(customer("3", ["Band"]), "pending"),
    row(customer("4", [""]), "approved"),
  ];
  const list = buildSendList(rows, ctx);

  it("keeps approved accounts with products and explains the rest", () => {
    expect(list.emails.map((e) => e.accountId)).toEqual(["1"]);
    expect(list.recipients).toBe(2);
    expect(list.skipped.map((s) => [s.accountId, s.reason])).toEqual([["2", "excluded"], ["3", "not_decided"], ["4", "no_products"]]);
    expect(list.emails[0]!.reorderUrl).toBe("https://store.example/reorder?c=1&s=HOLIDAY-2025");
  });

  it("exports one CSV row per address with merge fields and the campaign tag", () => {
    const lines = mailchimpImportCsv(list).trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]!.startsWith("Email Address,GREETING,COMPANY,CUST_ID,SEASON")).toBe(true);
    expect(lines[0]!.endsWith(",Tags")).toBe(true);
    expect(lines[1]!.startsWith("a@x.com,Store 1 team,Store 1,1,HOLIDAY-2025")).toBe(true);
    expect(lines[2]!.startsWith("b@x.com,")).toBe(true);
    expect(lines[1]!.endsWith(",reorder-HOLIDAY-2025")).toBe(true);
  });
});

describe("reorder links", () => {
  const m = { accountId: "7 8", company: "Store & Co", seasonCode: "HOLIDAY-2025", items: [{ sku: "A", name: "Band", meta: "", qty: 2 }] };
  it("fills URL templates and rejects non-web ones", () => {
    expect(reorderUrlFor(m, { mode: "url", template: "https://s.example/r/{CUST_ID}" })).toBe("https://s.example/r/7%208");
    expect(reorderUrlFor(m, { mode: "url", template: "javascript:alert(1)" })).toBeUndefined();
    expect(reorderUrlFor(m, { mode: "none" })).toBeUndefined();
  });
  it("writes a reorder email listing items", () => {
    const url = reorderUrlFor(m, { mode: "mailto", address: "orders@brand.example" })!;
    expect(url.startsWith("mailto:orders@brand.example?subject=Reorder%20for%20Store%20%26%20Co%20(7%208)")).toBe(true);
    expect(decodeURIComponent(url)).toContain("- Band (A) x 2");
  });
  it("drops the item list when the link would pass Mailchimp's 255 characters", () => {
    const long = { ...m, items: [1, 2, 3].map((i) => ({ sku: `SKU-${i}-LONGCODE`, name: "A very long product name for a tennis bracelet", meta: "", qty: i })) };
    const url = reorderUrlFor(long, { mode: "mailto", address: "orders@brand.example" })!;
    expect(url.length).toBeLessThanOrEqual(255);
    expect(url).not.toContain("body=");
  });
});
