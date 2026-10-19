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
  // Placeholder keys: the buttons and redirects are tested, never a real provider.
  MICROSOFT_CLIENT_ID: "e2e-microsoft-client",
  MICROSOFT_CLIENT_SECRET: "e2e-microsoft-secret",
  MICROSOFT_TENANT_ID: "11111111-2222-3333-4444-555555555555",
  GOOGLE_CLIENT_ID: "e2e-google-client",
  GOOGLE_CLIENT_SECRET: "e2e-google-secret",
  // Keep password sign-in for the other tests.
  PASSWORD_LOGIN: "on",
};
