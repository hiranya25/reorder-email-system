import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Databases set up before B2 kept the list of applied migrations in a "drizzle" schema. Copy it to
 * "public" once, so those migrations aren't run a second time ("type role already exists").
 */
async function moveLegacyBookkeeping(db: ReturnType<typeof getDb>) {
  const [row] = await db.execute<{ legacy: string | null; current: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations')::text as legacy, to_regclass('public.__drizzle_migrations')::text as current`,
  );
  if (!row?.legacy) return;
  await db.execute(sql`create table if not exists public.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
  const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.__drizzle_migrations`);
  if (n > 0) return;
  await db.execute(sql`insert into public.__drizzle_migrations (hash, created_at) select hash, created_at from drizzle.__drizzle_migrations order by id`);
  console.log("Moved the migration history from the old \"drizzle\" schema to \"public\".");
}

/** Applies pending migrations. Run on every deploy; already-applied ones are skipped. */
export async function runMigrations(url?: string) {
  const db = getDb(url);
  await moveLegacyBookkeeping(db);
  // Bookkeeping table in "public": some hosts don't let the database user create schemas.
  await migrate(db, { migrationsFolder: MIGRATIONS, migrationsSchema: "public" });
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
