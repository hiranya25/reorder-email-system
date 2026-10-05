import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes and neutralises formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", "ok"]])).toBe('"a,b","say ""hi""",\'=SUM(A1),ok\r\n');
  });
});
