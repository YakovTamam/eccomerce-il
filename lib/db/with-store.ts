import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "./client";

export type StoreTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const uuid = z.string().uuid();

/**
 * The ONLY way to touch tenant (business) data.
 * Runs `fn` in a transaction where the session role is the non-bypass `app_rls`
 * role and `app.store_id` is set, so Postgres RLS policies confine every query
 * to that store — even a query that names another store's `store_id` finds nothing.
 */
export async function withStore<T>(
  storeId: string,
  fn: (tx: StoreTx) => Promise<T>,
  db: Db = getDb(),
): Promise<T> {
  const id = uuid.parse(storeId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_rls`);
    await tx.execute(sql`select set_config('app.store_id', ${id}, true)`);
    return fn(tx);
  });
}
