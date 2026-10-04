import { describe, expect, it } from "vitest";
import { formatNumber, formatPercent, formatSeasonRange } from "./format";

describe("format", () => {
  it("formats numbers with thousands separators", () => {
    expect(formatNumber(1359)).toBe("1,359");
  });
  it("rounds shares to whole percents", () => {
    expect(formatPercent(0.6328)).toBe("63%");
  });
  it("formats a season range across years", () => {
    expect(formatSeasonRange("2025-10-01", "2026-01-31")).toBe("October 2025 – January 2026");
  });
});
