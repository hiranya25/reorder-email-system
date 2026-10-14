import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// N=2^15, r=8 needs 32 MB; maxmem leaves headroom. Roughly 50-100 ms per hash.
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEY_LEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash" so parameters can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "amipi", "iloveyou", "monkey", "dragon"];

/** Returns a plain-language problem, or undefined when the password is acceptable. */
export function passwordProblem(password: string, email: string): string | undefined {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) return "Don't include your email name in the password.";
  if (COMMON.some((c) => lower.includes(c)) && new Set(lower).size < 8) return "That password is too easy to guess.";
  if (new Set(password).size < 5) return "Use a mix of different characters.";
  return undefined;
}
