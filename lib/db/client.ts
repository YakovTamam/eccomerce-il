import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pool?: Pool; __db?: Db };

/**
 * Platform-level connection (table owner). It bypasses RLS, so it is for platform
 * concerns ONLY: auth tables, host→store resolution, store creation, migrations.
 * Business data must go through `withStore` (see with-store.ts, ADR 0002).
 */
export function getDb(): Db {
  if (!globalForDb.__db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForDb.__pool = new Pool({ connectionString, max: 5 });
    globalForDb.__db = drizzle(globalForDb.__pool, { schema });
  }
  return globalForDb.__db;
}
