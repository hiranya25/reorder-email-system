import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next.js's guard module; empty outside the Next.js server build.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://reorder:reorder@localhost:5432/reorder_test",
      APP_SECRET: "test-only-secret-that-is-long-enough-1234567890",
      APP_URL: "http://localhost:3000",
    },
    fileParallelism: false,
  },
});
