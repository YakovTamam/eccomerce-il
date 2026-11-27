import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "./client";

export type StoreTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const uuid = z.string().uuid();

type Ctx = { storeId: string; db: Db; tx: StoreTx };
const ambient = new AsyncLocalStorage<Ctx>();

/**
 * The ONLY way to touch tenant (business) data.
 * Runs `fn` in a transaction where the session role is the non-bypass `app_rls`
 * role and `app.store_id` is set, so Postgres RLS policies confine every query
 * to that store — even a query that names another store's `store_id` finds nothing.
 *
 * Calls for the SAME store and database made inside `fn` JOIN the running transaction
 * (so a draft approval, its side effects and its audit entry commit or roll back together).
 */
export async function withStore<T>(
  storeId: string,
  fn: (tx: StoreTx) => Promise<T>,
  db?: Db,
): Promise<T> {
  const id = uuid.parse(storeId);
  const current = ambient.getStore();
  // Join the running transaction when it is for the same store (and the same database, if one was named).
  if (
    current &&
    current.storeId === id &&
    (db === undefined || current.db === db)
  )
    return fn(current.tx);

  const conn = db ?? getDb();
  return conn.transaction(async (tx) => {
    await tx.execute(sql`set local role app_rls`);
    await tx.execute(sql`select set_config('app.store_id', ${id}, true)`);
    return ambient.run({ storeId: id, db: conn, tx }, () => fn(tx));
  });
}
