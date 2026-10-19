import { expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const admin = () => JSON.parse(readFileSync(join(__dirname, ".auth.json"), "utf8")) as { email: string; password: string; name: string; secret: string };

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(text: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/[^A-Z2-7]/gi, "").toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Same algorithm as an authenticator app (RFC 6238, SHA1, 6 digits). */
export function totp(secret: string, stepOffset = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1e6).padStart(6, "0");
}

// Kept on disk: Playwright restarts its worker after a failure, and the server remembers used codes.
const USED_FILE = join(__dirname, ".totp-used.json");
const lastUsed = {
  get: (secret: string): number | undefined => (existsSync(USED_FILE) ? (JSON.parse(readFileSync(USED_FILE, "utf8")) as Record<string, number>)[secret] : undefined),
  set: (secret: string, step: number) => {
    const all = existsSync(USED_FILE) ? (JSON.parse(readFileSync(USED_FILE, "utf8")) as Record<string, number>) : {};
    writeFileSync(USED_FILE, JSON.stringify({ ...all, [secret]: step }));
  },
};

/**
 * A code the server hasn't seen yet. Codes are single-use per 30-second step and the server
 * accepts one step either side, so use the current or next step, waiting only if both are used.
 */
export async function freshCode(secret: string, page: Page): Promise<string> {
  for (;;) {
    const now = Math.floor(Date.now() / 30_000);
    const used = lastUsed.get(secret) ?? -Infinity;
    const step = [now, now + 1].find((s) => s > used);
    if (step !== undefined) {
      lastUsed.set(secret, step);
      return totp(secret, step - now);
    }
    await page.waitForTimeout(30_500 - (Date.now() % 30_000));
  }
}

export async function signIn(page: Page, who = admin()) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/login\/verify$/);
  await page.getByLabel("Authenticator code").fill(await freshCode(who.secret, page));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/campaigns$/);
  await expect(page.getByText(who.name, { exact: true })).toBeVisible();
}
