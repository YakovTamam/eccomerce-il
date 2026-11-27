import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import {
  createStoreForUser,
  findStoreIdByKey,
  SlugTakenError,
} from "@/lib/tenancy/stores";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("tenant isolation (RLS)", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  let A: string, B: string, userA: string, userB: string;
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    const mk = async (n: string) =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${n}-${suffix}@t.test`, name: n })
          .returning()
      )[0].id;
    userA = await mk("a");
    userB = await mk("b");
    A = (
      await createStoreForUser(
        userA,
        { name: "Store A", slug: `a-${suffix}` },
        db,
      )
    ).id;
    B = (
      await createStoreForUser(
        userB,
        { name: "Store B", slug: `b-${suffix}` },
        db,
      )
    ).id;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(sql`id in (${userA}, ${userB})`);
    await pool.end();
  });

  it("store A context only sees store A rows", async () => {
    const rows = await withStore(
      A,
      (tx) => tx.select().from(schema.storeMembers),
      db,
    );
    expect(rows.map((r) => r.storeId)).toEqual([A]);
    const sRows = await withStore(
      A,
      (tx) => tx.select().from(schema.stores),
      db,
    );
    expect(sRows.map((r) => r.id)).toEqual([A]);
  });

  it("cannot read store B even when querying with B's store_id directly", async () => {
    const rows = await withStore(
      A,
      (tx) =>
        tx
          .select()
          .from(schema.storeMembers)
          .where(eq(schema.storeMembers.storeId, B)),
      db,
    );
    expect(rows).toEqual([]);
    const s = await withStore(
      A,
      (tx) => tx.select().from(schema.stores).where(eq(schema.stores.id, B)),
      db,
    );
    expect(s).toEqual([]);
  });

  it("cannot write into store B (insert is rejected by RLS)", async () => {
    await expect(
      withStore(
        A,
        (tx) =>
          tx
            .insert(schema.storeDomains)
            .values({ storeId: B, hostname: `evil-${suffix}.example.com` }),
        db,
      ),
    ).rejects.toThrow();
  });

  it("cannot update or delete store B rows (affects 0 rows)", async () => {
    const upd = await withStore(
      A,
      (tx) =>
        tx
          .update(schema.stores)
          .set({ name: "pwned" })
          .where(eq(schema.stores.id, B))
          .returning(),
      db,
    );
    expect(upd).toEqual([]);
    const del = await withStore(
      A,
      (tx) =>
        tx
          .delete(schema.storeMembers)
          .where(eq(schema.storeMembers.storeId, B))
          .returning(),
      db,
    );
    expect(del).toEqual([]);
    const [still] = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, B));
    expect(still.name).toBe("Store B");
  });

  it("can write inside its own store", async () => {
    await withStore(
      A,
      (tx) =>
        tx
          .insert(schema.storeDomains)
          .values({ storeId: A, hostname: `ok-${suffix}.example.com` }),
      db,
    );
    expect(await findStoreIdByKey(`ok-${suffix}.example.com`, db)).toBe(A);
  });

  it("without a store context nothing is visible, and auth tables are inaccessible", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_rls`);
      return tx.select().from(schema.storeMembers);
    });
    expect(rows).toEqual([]);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role app_rls`);
        return tx.select().from(schema.users);
      }),
    ).rejects.toThrow();
  });

  it("rejects non-uuid store ids and duplicate slugs", async () => {
    await expect(
      withStore("x' or '1'='1", async () => 1, db),
    ).rejects.toThrow();
    await expect(
      createStoreForUser(userA, { name: "dup", slug: `a-${suffix}` }, db),
    ).rejects.toBeInstanceOf(SlugTakenError);
  });
});
