import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client";

/** Applies pending migrations. Run on every deploy; already-applied ones are skipped. */
export async function runMigrations(url?: string) {
  const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  await migrate(getDb(url), { migrationsFolder: folder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations()
    .then(() => console.log("Database is up to date."))
    .catch((e) => {
      console.error("Migration failed:", e);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
