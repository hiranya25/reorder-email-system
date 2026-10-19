import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "./client";
import { runMigrations } from "./migrate";

const base = process.env.TEST_DATABASE_URL ?? "postgres://reorder:reorder@localhost:5432/reorder_test";
const NAME = "reorder_migrate_check";
const url = base.replace(/\/[^/?]+(\?|$)/, `/${NAME}$1`);
const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };

async function freshDatabase(): Promise<boolean> {
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${NAME}`);
    await admin.unsafe(`create database ${NAME}`);
    return true;
  } catch (e) {
    console.warn(`Skipping migration upgrade test: ${(e as Error).message}`);
    return false;
  } finally {
    await admin.end();
  }
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("migrations", () => {
  afterAll(closeDb);

  it("upgrades a database set up before B2 without re-running old migrations", async (ctx) => {
    if (!(await freshDatabase())) return ctx.skip();
    // What main (B1) did: only the first migration, history kept in the "drizzle" schema.
    const legacy = mkdtempSync(join(tmpdir(), "legacy-migrations-"));
    cpSync(folder, legacy, { recursive: true });
    writeFileSync(join(legacy, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
    await migrate(getDb(url), { migrationsFolder: legacy });
    await closeDb();
    rmSync(legacy, { recursive: true, force: true });

    await runMigrations(url);
    await runMigrations(url); // a second deploy is a no-op
    const db = getDb(url);
    const [applied] = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.__drizzle_migrations`);
    expect(applied!.n).toBe(journal.entries.length);
    const [col] = await db.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.columns where table_name = 'users' and column_name = 'username'`);
    expect(col!.n).toBe(1);
  });
});
