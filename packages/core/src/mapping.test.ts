import { describe, expect, it } from "vitest";
import type { CustomerRecord } from "./import/types";
import { checkReason, mappingCounts, matchesFilter, resolveMapping, type Decision } from "./mapping";

function customer(over: Partial<CustomerRecord>): CustomerRecord {
  return { accountId: "1", name: "Alpha", emails: ["a@alpha.com"], rep: "JO", items: [], units: 1, lines: 1, check: "ready", reasons: [], sharedWith: [], invalidEmails: [], large: false, ...over };
}

const d = (status: Decision["status"], emails: string[] = []): Decision => ({ status, emails, decidedAt: "2026-10-05", decidedBy: "Shruti" });
const opts = { useRemembered: true, campaignId: "c2" };

describe("resolveMapping", () => {
  const customers = [
    customer({ accountId: "1" }),
    customer({ accountId: "2", emails: ["new@beta.com"] }),
    customer({ accountId: "3", emails: [], check: "no_email" }),
    customer({ accountId: "4" }),
  ];
  const remembered = {
    "1": { emails: ["a@alpha.com"], approvedAt: "2025-10-01", campaignId: "c1" },
    "2": { emails: ["old@beta.com"], approvedAt: "2025-10-01", campaignId: "c1" }, // email changed since
    "3": { emails: ["added@gamma.com"], approvedAt: "2025-10-01", campaignId: "c1" }, // added by hand last season
    "4": { emails: ["a@alpha.com"], approvedAt: "2025-10-01", campaignId: "c1" },
  };

  it("applies remembered approvals only while still valid", () => {
    const rows = resolveMapping(customers, { "4": d("undecided") }, remembered, opts);
    expect(rows.map((r) => [r.customer.accountId, r.status, r.source, r.emails])).toEqual([
      ["1", "approved", "remembered", ["a@alpha.com"]],
      ["2", "pending", "none", []],
      ["3", "approved", "remembered", ["added@gamma.com"]],
      ["4", "pending", "none", []], // explicit undo wins over memory
    ]);
  });

  it("lets this campaign's decisions win", () => {
    const rows = resolveMapping(customers, { "1": d("excluded"), "2": d("approved", ["new@beta.com"]) }, remembered, opts);
    expect(rows[0]).toMatchObject({ status: "excluded", emails: [] });
    expect(rows[1]).toMatchObject({ status: "approved", emails: ["new@beta.com"], source: "manual" });
    expect(mappingCounts(rows)).toMatchObject({ approved: 3, excluded: 1, pending: 0 });
  });

  it("ignores memory when disabled (demo campaign)", () => {
    expect(resolveMapping(customers, {}, remembered, { ...opts, useRemembered: false }).every((r) => r.status === "pending")).toBe(true);
  });
});

describe("checkReason", () => {
  it("explains each case like the mockup", () => {
    expect(checkReason(customer({}), ["info"])).toBe("One clear email on file");
    expect(checkReason(customer({ check: "review", reasons: ["generic_inbox"], emails: ["sales@x.com"], large: true }), ["sales"])).toBe("Generic inbox (sales@) · large account");
    expect(
      checkReason(customer({ name: "Joyeria Universal", check: "review", reasons: ["shared_email"], sharedWith: [{ accountId: "7749", name: "Joyeria Universal Branch 1" }] }), []),
    ).toBe("Email shared with Branch 1 (7749)");
    expect(checkReason(customer({ check: "review", reasons: ["multi_email"], emails: ["a@x.com", "b@x.com"] }), [])).toBe("Two emails in one field");
    expect(checkReason(customer({ check: "no_email", emails: [] }), [])).toBe("No email in sales data");
  });

  it("filters by issue type", () => {
    expect(matchesFilter(customer({ reasons: ["generic_inbox"] }), "generic")).toBe(true);
    expect(matchesFilter(customer({ large: true }), "large")).toBe(true);
    expect(matchesFilter(customer({}), "shared")).toBe(false);
  });
});
