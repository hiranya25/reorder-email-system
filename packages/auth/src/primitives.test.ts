import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { base32Decode, base32Encode, generateRecoveryCodes, normalizeRecoveryCode, otpauthUri, totpCode, verifyTotp } from "./totp";

const SECRET = "x".repeat(40);

describe("TOTP", () => {
  // RFC 6238 test vectors use the ASCII secret "12345678901234567890" (SHA1, 8 digits);
  // the last 6 digits must match for our 6-digit codes.
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches RFC 6238 at t=%i", (t, code) => {
    expect(totpCode(rfcSecret, Math.floor(t / 30))).toBe(code);
  });

  it("round-trips base32", () => {
    const buf = Buffer.from("hello authenticator");
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("accepts one step of drift and refuses replays", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 2), now)).toBeUndefined();
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step), now, step)).toBeUndefined();
    expect(verifyTotp(rfcSecret, "12345", now)).toBeUndefined();
  });

  it("builds an authenticator link and recovery codes", () => {
    expect(otpauthUri("ABC", "shruti@amipi.com")).toBe(
      "otpauth://totp/AMIPI%20Reorder%20Console%3Ashruti%40amipi.com?secret=ABC&issuer=AMIPI%20Reorder%20Console&algorithm=SHA1&digits=6&period=30",
    );
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(normalizeRecoveryCode(" ABCD efgh ")).toBe("abcd-efgh");
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("explains weak passwords", () => {
    expect(passwordProblem("short", "a@amipi.com")).toMatch(/12 characters/);
    expect(passwordProblem("shruti-is-great-2026", "shruti@amipi.com")).toMatch(/email name/);
    expect(passwordProblem("aaaaaaaaaaaaaa", "x@amipi.com")).toMatch(/mix/);
    expect(passwordProblem("Restock-Season-2026!", "shruti@amipi.com")).toBeUndefined();
  });
});

describe("encryption", () => {
  it("round-trips and detects tampering", () => {
    const enc = encrypt("JBSWY3DPEHPK3PXP", SECRET);
    expect(decrypt(enc, SECRET)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, tag, data] = enc.split(".");
    expect(() => decrypt([iv, tag, data!.slice(0, -2) + "AA"].join("."), SECRET)).toThrow();
    expect(() => decrypt(enc, "y".repeat(40))).toThrow();
    expect(() => encrypt("x", "short")).toThrow(/32 characters/);
  });
});
