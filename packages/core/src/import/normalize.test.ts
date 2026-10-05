import { describe, expect, it } from "vitest";
import { displayCompanyName, isTotalLabel, normalizeCategory, normalizeOrigin, parseEmails } from "./normalize";

describe("normalize", () => {
  it("standardizes categories", () => {
    expect(normalizeCategory("BRACELET")).toBe("Bracelets");
    expect(normalizeCategory("rings")).toBe("Rings");
    expect(normalizeCategory("pendant")).toBe("Pendants");
    expect(normalizeCategory("MISC")).toBe("Other");
    expect(normalizeCategory("")).toBe("Other");
    expect(normalizeCategory("NOSE PIN")).toBe("Nose Pin");
  });
  it("reads origin", () => {
    expect(normalizeOrigin("Lab Grown")).toBe("Lab grown");
    expect(normalizeOrigin("LGD")).toBe("Lab grown");
    expect(normalizeOrigin("Natural")).toBe("Natural");
    expect(normalizeOrigin("")).toBeUndefined();
  });
  it("splits and validates emails", () => {
    expect(parseEmails(" A@x.com;b@y.com ")).toEqual({ valid: ["a@x.com", "b@y.com"], invalid: [] });
    expect(parseEmails("not-an-email")).toEqual({ valid: [], invalid: ["not-an-email"] });
    expect(parseEmails(null)).toEqual({ valid: [], invalid: [] });
  });
  it("detects total rows", () => {
    expect(isTotalLabel("Total")).toBe(true);
    expect(isTotalLabel("Grand Total")).toBe(true);
    expect(isTotalLabel("Totally Gems")).toBe(false);
  });
  it("makes friendly company names", () => {
    expect(displayCompanyName("OLIVER SMITH JEWELER INC")).toBe("Oliver Smith Jeweler Inc");
    expect(displayCompanyName("ADEPT CORPORATION DBA POUNDERS JEWELRY")).toBe("Pounders Jewelry");
    expect(displayCompanyName("ADLER'S JEWELERS")).toBe("Adler's Jewelers");
    expect(displayCompanyName("DIAMOND BROKERS OF MEMPHIS")).toBe("Diamond Brokers of Memphis");
    expect(displayCompanyName("ISRAEL DIAMOND SUPPLY LLC")).toBe("Israel Diamond Supply LLC");
    expect(displayCompanyName("Already Nice & Co")).toBe("Already Nice & Co");
  });
});
