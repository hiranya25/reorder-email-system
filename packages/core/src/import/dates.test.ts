import { describe, expect, it } from "vitest";
import { parseOrderDate } from "./dates";

const S = "2025-10-01", E = "2026-01-31";

describe("parseOrderDate", () => {
  it("places a bare month in the season window", () => {
    expect(parseOrderDate("December", S, E)).toEqual({ ok: true, period: { year: 2025, month: 12 } });
    expect(parseOrderDate("January", S, E)).toEqual({ ok: true, period: { year: 2026, month: 1 } });
    expect(parseOrderDate("Jan", S, E)).toMatchObject({ ok: true });
  });
  it("rejects months outside the window", () => {
    expect(parseOrderDate("June", S, E)).toEqual({ ok: false, reason: "outside_season" });
    expect(parseOrderDate("2025-06-14", S, E)).toEqual({ ok: false, reason: "outside_season" });
  });
  it("reads ISO, US, month-year, Date and Excel serial dates", () => {
    expect(parseOrderDate("2025-11-03", S, E)).toMatchObject({ ok: true, period: { month: 11 } });
    expect(parseOrderDate("11/03/2025", S, E)).toMatchObject({ ok: true, period: { month: 11 } });
    expect(parseOrderDate("Dec 2025", S, E)).toMatchObject({ ok: true, period: { year: 2025 } });
    expect(parseOrderDate(new Date(Date.UTC(2026, 0, 15)), S, E)).toMatchObject({ ok: true, period: { year: 2026, month: 1 } });
    expect(parseOrderDate(45992, S, E)).toMatchObject({ ok: true, period: { year: 2025, month: 12 } });
    expect(parseOrderDate(202512, S, E)).toMatchObject({ ok: true, period: { year: 2025, month: 12 } });
  });
  it("flags unreadable values", () => {
    expect(parseOrderDate("soon", S, E)).toEqual({ ok: false, reason: "unreadable" });
    expect(parseOrderDate(null, S, E)).toEqual({ ok: false, reason: "unreadable" });
  });
});
