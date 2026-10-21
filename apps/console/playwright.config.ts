import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV } from "./e2e/global-setup";

const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /password-only/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    // Same database, second server with the default settings: password only, no 6-digit code.
    {
      name: "password-only",
      testMatch: /password-only\.spec\.ts/,
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT + 1}` },
    },
  ],
  // Runs the same standalone server cPanel runs. Expects `pnpm build` + prepare-standalone first.
  webServer: [
    {
      command: "pnpm exec tsx e2e/fake-mailchimp.ts",
      url: "http://127.0.0.1:3290/__state",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "node .next/standalone/apps/console/server.js",
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...E2E_ENV, PORT: String(PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    },
    {
      command: "node .next/standalone/apps/console/server.js",
      url: `http://localhost:${PORT + 1}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...E2E_ENV, AUTHENTICATOR_CODE: "off", APP_URL: `http://localhost:${PORT + 1}`, PORT: String(PORT + 1), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    },
  ],
});
