import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

export default function globalSetup() {
  rmSync(join(__dirname, ".totp-used.json"), { force: true });
  execSync("pnpm exec tsx e2e/setup-db.ts", { stdio: "inherit", env: { ...process.env, ...E2E_ENV } });
}

export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://reorder:reorder@localhost:5432/reorder_e2e",
  APP_SECRET: "e2e-only-secret-that-is-long-enough-1234567890",
  APP_URL: "http://localhost:3200",
  ALLOWED_EMAIL_DOMAIN: "amipi.com",
};
