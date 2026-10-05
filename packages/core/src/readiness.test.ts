import { describe, expect, it } from "vitest";
import { approvalReadiness, canApprove } from "./readiness";

const ready = { pendingAccounts: 0, catalogUploaded: true, productsConfirmed: true, recommendationsComplete: true, reorderLinkSet: true, brandSet: false, emails: 200 };

describe("approval readiness", () => {
  it("allows approval with only warnings left", () => {
    const items = approvalReadiness(ready);
    expect(items.filter((i) => !i.ok).map((i) => i.id)).toEqual(["brand"]);
    expect(canApprove(items)).toBe(true);
  });
  it("blocks on undecided accounts or a missing reorder link", () => {
    expect(canApprove(approvalReadiness({ ...ready, pendingAccounts: 3 }))).toBe(false);
    const items = approvalReadiness({ ...ready, reorderLinkSet: false });
    expect(items.find((i) => i.id === "reorder")!.text).toBe("Reorder button link not set (Settings)");
    expect(canApprove(items)).toBe(false);
  });
});
