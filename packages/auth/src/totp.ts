import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/** RFC 6238 code for one time step (HMAC-SHA1, 6 digits), as authenticator apps compute it. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Accepts the current code or one step either side (phone clocks drift).
 * Returns the matched step, or undefined. Steps at or before lastStep are refused, so a code works once.
 */
export function verifyTotp(secret: string, code: string, nowMs = Date.now(), lastStep?: number | null): number | undefined {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return undefined;
  const now = timeStep(nowMs);
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    if (totpCode(secret, step) === clean) return step;
  }
  return undefined;
}

/** Link an authenticator app reads from the QR code. */
export function otpauthUri(secret: string, email: string, issuer = "AMIPI Reorder Console"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD}`;
}

/** 8 one-time recovery codes like "k3f9-2m7q", for a lost phone. */
export function generateRecoveryCodes(count = 8): string[] {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => chars[x % chars.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
}
