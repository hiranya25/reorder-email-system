import type { CustomerRecord, CustomerItem } from "@reorder/core";
import { describe, expect, it } from "vitest";
import { emailChecks, GMAIL_CLIP_BYTES } from "./checks";
import { groupsInUse, MERGE_FIELD_DEFS, MERGE_TAG_MAX, MERGE_VALUE_MAX, mergeFields } from "./merge";
import { buildEmailModel, seasonCodeFrom, seasonWordFrom } from "./model";
import { firstNameFromEmail, repDisplayName } from "./names";
import { displayProductName, metalFromSku } from "./product";
import { renderMailchimpTemplate, renderPreviewHtml } from "./render";

const item = (sku: string, name: string, qty: number): CustomerItem => ({ sku, name, category: "Bracelets", origin: "Natural", qty, lines: 1, lastPeriod: { year: 2025, month: 12 } });

function customer(over: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    accountId: "2740", name: "Oliver Smith Jeweler Inc", emails: ["oliver@oliversmith.example"], rep: "JYOTI",
    items: [item("B401300-14WD", "3ct RD 4P CLASSIC TENNIS BRACELET", 10), item("B401200-14WD", "2ct RD 4P CLASSIC TENNIS BRACELET", 9), item("B403800-14WNA", "8 ct TENNIS 4 PRONG FULL WAY BRACELET", 5), item("X1-14Y", "Hoops", 1)],
    units: 25, lines: 4, check: "ready", reasons: [], sharedWith: [], invalidEmails: [], large: false, ...over,
  };
}

const base = { campaignName: "Holiday 2026 Reorder", seasonStart: "2025-10-01" };

describe("names", () => {
  it("finds first names only when clearly a person", () => {
    expect(firstNameFromEmail("oliver@x.com")).toBe("Oliver");
    expect(firstNameFromEmail("Mindy.Beck@x.com")).toBe("Mindy");
    expect(firstNameFromEmail("info@x.com")).toBeUndefined();
    expect(firstNameFromEmail("zzltd@x.com")).toBeUndefined();
    expect(firstNameFromEmail("harings@x.com")).toBeUndefined();
  });
  it("turns rep codes into names when they are names", () => {
    expect(repDisplayName("JYOTI")).toBe("Jyoti");
    expect(repDisplayName("CS-AM")).toBeUndefined();
    expect(repDisplayName("SALES5")).toBeUndefined();
    expect(repDisplayName("COMPANY")).toBeUndefined();
  });
});

describe("product text", () => {
  it("expands style descriptions", () => {
    expect(displayProductName("3ct RD 4P CLASSIC TENNIS BRACELET")).toBe("3 ct Round 4-Prong Classic Tennis Bracelet");
    expect(displayProductName("1ct RD 3P MARTINI STUDS-PB")).toBe("1 ct Round 3-Prong Martini Studs");
  });
  it("reads metal from the SKU", () => {
    expect(metalFromSku("B401300-14WD")).toBe("14K white gold");
    expect(metalFromSku("LB401700-14YQA")).toBe("14K yellow gold");
    expect(metalFromSku("B401400-PTA")).toBe("Platinum");
    expect(metalFromSku("ABC")).toBeUndefined();
  });
  it("derives season word and code", () => {
    expect(seasonWordFrom("Holiday 2026 Reorder")).toBe("holiday");
    expect(seasonWordFrom("2027 Spring Restock")).toBe("spring");
    expect(seasonCodeFrom("Holiday 2026 Reorder", "2025-10-01")).toBe("HOLIDAY-2025");
  });
});

describe("email model", () => {
  it("builds the mockup email for Oliver", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [] });
    expect(m.greetingName).toBe("Oliver");
    expect(m.subject).toBe("Restock your holiday bestsellers");
    expect(m.items.map((i) => [i.name, i.meta, i.qty])).toEqual([
      ["3 ct Round 4-Prong Classic Tennis Bracelet", "Natural · 14K white gold", 10],
      ["2 ct Round 4-Prong Classic Tennis Bracelet", "Natural · 14K white gold", 9],
      ["8 ct Tennis 4 Prong Full Way Bracelet", "Natural · 14K white gold", 5],
    ]);
    expect(m.moreCount).toBe(1);
    expect(m.repName).toBe("Jyoti");
    expect(m.segment).toBe("Natural · Bracelets");
  });

  it("falls back to the company team and skips undescribed products", () => {
    const m = buildEmailModel({ ...base, customer: customer({ emails: ["info@x.com"], items: [item("A-14W", "", 5), item("B-14W", "Band", 1)] }), emails: [] });
    expect(m.greetingName).toBe("Oliver Smith Jeweler Inc team");
    expect(m.items.map((i) => i.sku)).toEqual(["B-14W"]);
    expect(m.leftOut).toEqual({ noName: 1, outOfStock: 0, hidden: 0 });
    expect(m.moreCount).toBe(0);
  });
});

describe("rendering", () => {
  it("escapes customer data and hides empty slots", () => {
    const m = buildEmailModel({ ...base, customer: customer({ name: "<script>x</script>", emails: ["info@x.com"], items: [item("A-14W", 'Ring "Eve" & <b>', 1)] }), emails: [] });
    const html = renderPreviewHtml(m);
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt; team");
    expect(html).toContain("Ring &quot;Eve&quot; &amp; &lt;B&gt;");
    expect(html).not.toContain("You ordered 0");
    expect(html.match(/You ordered \d/g)).toHaveLength(1);
    expect(html).not.toContain("more products from last season");
  });

  it("rejects unsafe links", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [], reorderUrl: "javascript:alert(1)" });
    expect(renderPreviewHtml(m)).not.toContain("javascript:");
  });

  it("allows inline images in the preview only, never data: links", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [], reorderUrl: "data:text/html,<b>x</b>" });
    m.items[0]!.imageUrl = "data:image/svg+xml;utf8,%3Csvg%3E";
    m.items[1]!.imageUrl = "data:text/html,<script>";
    const html = renderPreviewHtml(m);
    expect(html).toContain('src="data:image/svg+xml;utf8,%3Csvg%3E"');
    expect(html).not.toContain("data:text/html");
  });

  it("produces a Mailchimp template with valid merge tags", () => {
    const html = renderMailchimpTemplate(buildEmailModel({ ...base, customer: customer(), emails: [] }));
    expect(html).toContain("Hi *|RCGREET|*,");
    expect(html).toContain("*|IF:RCITEM2|*");
    expect(html).toContain("*|HTML:RCITEM1|*");
    expect(html).toContain("*|HTML:RCITEM1D|*");
    // The intro is the same for everyone, so it's written in rather than a field.
    expect(html).toContain("Last holiday season, you chose some beautiful pieces");
    expect(html).toContain("*|UNSUB|*");
    expect(html).not.toContain("Oliver");
    const tags = [...html.matchAll(/\*\|(?:IF:|HTML:)?([A-Z0-9_]+)\|\*/g)].map((t) => t[1]!).filter((t) => !["END", "ELSE"].includes(t));
    for (const tag of tags) expect(tag.length, tag).toBeLessThanOrEqual(MERGE_TAG_MAX);
    // Every personal tag is one Mailchimp knows about (UNSUB and MC:SUBJECT are built in).
    const known = new Set([...MERGE_FIELD_DEFS.map((d) => d.tag), "UNSUB"]);
    for (const tag of tags) expect(known.has(tag), tag).toBe(true);
    const opens = (html.match(/\*\|IF:/g) ?? []).length;
    expect((html.match(/\*\|END:IF\|\*/g) ?? []).length).toBe(opens);
  });

  it("follows the AMIPI layout", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [], reorderUrl: "https://amipi.example/cart?c=2740" });
    const html = renderPreviewHtml(m);
    expect(html).toContain("Last holiday season, you chose some beautiful pieces");
    expect(html).toContain("1-800-530-2647");
    expect(html).toContain('href="tel:18005302647"');
    expect(html).toContain("Your favorite diamond guys!");
    expect(html).toContain("Would you like us to place a reorder for you?");
    expect(html).toMatch(/href="https:\/\/amipi\.example\/cart\?c=2740"[^>]*>&#128722; Yes, Go Ahead/);
    expect(html).toContain("Your Diamond Concierge @AMIPI");
    expect(html).toContain("Jyoti");
    const withLogo = renderPreviewHtml({ ...m, brand: { ...m.brand, logoUrl: "https://cdn.example/logo.png" } });
    expect(withLogo).toContain('<img src="https://cdn.example/logo.png"');
    expect(withLogo).not.toContain("Your favorite diamond guys!");
    expect(renderPreviewHtml({ ...m, brand: { ...m.brand, logoUrl: "javascript:alert(1)" } })).not.toContain("javascript:");
  });

  it("signs with the rep in Mailchimp, or the sales team", () => {
    const html = renderMailchimpTemplate(buildEmailModel({ ...base, customer: customer(), emails: [] }));
    expect(html).toContain("*|IF:RCREP|**|RCREP|**|ELSE:|*AMIPI Sales Team*|END:IF|*");
    expect(html).toContain("*|IF:RCREC1|*");
  });

  it("stays well under Gmail's clipping limit", () => {
    const html = renderPreviewHtml(buildEmailModel({ ...base, customer: customer(), emails: [] }));
    expect(new TextEncoder().encode(html).length).toBeLessThan(GMAIL_CLIP_BYTES / 4);
  });
});

describe("merge fields and checks", () => {
  it("fills every slot and clips long values", () => {
    const m = buildEmailModel({ ...base, customer: customer({ items: [item("A-14W", "x".repeat(400), 1)] }), emails: [] });
    const f = mergeFields(m);
    expect(Object.keys(f).every((k) => k.length <= MERGE_TAG_MAX)).toBe(true);
    expect(f.RCITEM1!.length).toBeLessThanOrEqual(MERGE_VALUE_MAX);
    expect(f.RCITEM1!.endsWith("…")).toBe(true);
    expect(f.RCITEM1D).toBe('<i>Natural · 14K white gold</i><br/><span style="font-size:12px;color:#6b7280;">A-14W · You ordered 1</span>');
    expect(f.RCITEM2).toBe("");
    expect(Object.keys(f).sort()).toEqual(MERGE_FIELD_DEFS.map((d) => d.tag).sort());
  });

  it("needs only the core fields until links, images or picks are used", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [] });
    const groups = groupsInUse([m]);
    expect([...groups]).toEqual(["core"]);
    expect(MERGE_FIELD_DEFS.filter((d) => d.group === "core")).toHaveLength(10);
    expect(MERGE_FIELD_DEFS).toHaveLength(19);
    const html = renderMailchimpTemplate(m, groups);
    expect(html).not.toMatch(/RCITEM\dI|RCREC/);
    expect(html).not.toContain("New this season");
    const withPicks = { ...m, picks: [{ name: "Halo ring", url: "https://amipi.example/p/1" }, {}, {}] };
    expect([...groupsInUse([withPicks])].sort()).toEqual(["core", "picks"]);
  });

  it("puts each product's link, details and quantity into two fields of at most 255 characters", () => {
    const m = buildEmailModel({ ...base, customer: customer({ items: [item("B4-14WD", "Ring <b>& Co</b>", 2)] }), emails: [] });
    m.items[0]!.url = "https://amipi.example/p/B4";
    const f = mergeFields(m);
    const shown = m.items[0]!.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    expect(shown).toContain("&lt;");
    expect(f.RCITEM1).toBe(`<a href="https://amipi.example/p/B4" style="color:#2b3a67;text-decoration:none;">${shown}</a>`);
    m.items[0]!.url = `https://amipi.example/${"x".repeat(300)}`;
    expect(mergeFields(m).RCITEM1).toBe(shown);
    m.items[0]!.url = "javascript:alert(1)";
    expect(mergeFields(m).RCITEM1).not.toContain("javascript");
    // The preview shows exactly what Mailchimp will.
    m.items[0]!.url = "https://amipi.example/p/B4";
    expect(renderPreviewHtml(m)).toContain(mergeFields(m).RCITEM1!);
    expect(renderPreviewHtml(m)).toContain(mergeFields(m).RCITEM1D!);
  });

  it("lists what still needs doing", () => {
    const m = buildEmailModel({ ...base, customer: customer(), emails: [] });
    const checks = emailChecks(m, { approved: false, htmlBytes: 20000, catalogUploaded: false });
    expect(checks.map((c) => c.level)).toEqual(["warn", "ok", "ok", "warn", "warn", "warn", "ok"]);
    expect(checks[2]!.text).toBe("4 products last season, showing the top 3 by quantity");
  });
});
