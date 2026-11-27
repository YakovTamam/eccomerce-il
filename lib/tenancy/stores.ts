import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { storeDomains, storeMembers, stores } from "@/lib/db/schema";

/**
 * Platform-level store lookups (run as table owner, bypass RLS). They only expose
 * tenancy metadata needed BEFORE a store context exists. All business data: withStore.
 */
export async function findStoreIdByKey(
  key: string,
  db: Db = getDb(),
): Promise<string | null> {
  // `key` is a slug (no dots) or a custom hostname (has dots).
  if (key.includes(".")) {
    const [row] = await db
      .select({ storeId: storeDomains.storeId })
      .from(storeDomains)
      .innerJoin(stores, eq(stores.id, storeDomains.storeId))
      .where(and(eq(storeDomains.hostname, key), eq(stores.status, "active")))
      .limit(1);
    return row?.storeId ?? null;
  }
  const [row] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.slug, key), eq(stores.status, "active")))
    .limit(1);
  return row?.id ?? null;
}

export async function listStoresForUser(userId: string, db: Db = getDb()) {
  return db
    .select({
      id: stores.id,
      slug: stores.slug,
      name: stores.name,
      role: storeMembers.role,
    })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.userId, userId));
}

export async function isMemberOfStore(
  userId: string,
  storeId: string,
  db: Db = getDb(),
) {
  const [row] = await db
    .select({ role: storeMembers.role })
    .from(storeMembers)
    .where(
      and(eq(storeMembers.userId, userId), eq(storeMembers.storeId, storeId)),
    )
    .limit(1);
  return row?.role ?? null;
}

export class SlugTakenError extends Error {
  constructor() {
    super("slug_taken");
  }
}

export async function createStoreForUser(
  userId: string,
  input: { name: string; slug: string },
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, input.slug))
      .limit(1);
    if (existing.length) throw new SlugTakenError();
    const [store] = await tx
      .insert(stores)
      .values({ name: input.name, slug: input.slug })
      .returning();
    await tx
      .insert(storeMembers)
      .values({ storeId: store.id, userId, role: "owner" });
    return store;
  });
}
