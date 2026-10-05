import { describe, expect, it } from "vitest";
import { currentStepNumber, deriveSteps } from "./steps";
import type { CampaignSummary } from "./types";

const DEMO_SUMMARY: CampaignSummary = {
  lines: 1240, customers: 210, ready: 172, review: 30, noEmail: 8, units: 1880, skus: 560, styles: 330, reps: 18,
  categories: [], productsPerCustomer: { one: 76, two: 34, threePlus: 100 }, origin: { labGrown: 0.62, natural: 0.38 },
};

const base = { decidedAccounts: 0, catalogUploaded: false, approverLabel: "Shruti / Founder" };

describe("deriveSteps", () => {
  it("starts at import when nothing is uploaded", () => {
    const steps = deriveSteps(base);
    expect(steps).toHaveLength(8);
    expect(steps[0]).toMatchObject({ key: "import", state: "in_progress" });
    expect(currentStepNumber(steps)).toBe(1);
  });

  it("puts mapping in progress and blocks product check without a catalog", () => {
    const steps = deriveSteps({ ...base, summary: DEMO_SUMMARY });
    expect(steps[0]).toMatchObject({ state: "done", detail: "1,240 lines" });
    expect(steps[1]).toMatchObject({ state: "in_progress", detail: "172 of 210 ready" });
    expect(steps[2]).toMatchObject({ state: "blocked", detail: "Catalog needed" });
    expect(steps[5]).toMatchObject({ state: "not_started", detail: "Shruti / Founder" });
    expect(currentStepNumber(steps)).toBe(2);
  });

  it("marks mapping done once every account is decided", () => {
    const steps = deriveSteps({ ...base, summary: DEMO_SUMMARY, decidedAccounts: 210, catalogUploaded: true });
    expect(steps[1]?.state).toBe("done");
    expect(steps[2]?.state).toBe("in_progress");
  });
});
