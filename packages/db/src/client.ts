import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; sql: postgres.Sql } | undefined;

/** One pool per process. Shared hosting allows few connections, so keep it small. */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (cached) return cached.db;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), idle_timeout: 30, onnotice: () => {} });
  cached = { db: drizzle(sql, { schema }), sql };
  return cached.db;
}

export async function closeDb() {
  await cached?.sql.end();
  cached = undefined;
}
