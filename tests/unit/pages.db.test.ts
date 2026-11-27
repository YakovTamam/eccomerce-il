import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createStoreForUser } from "@/lib/tenancy/stores";
import {
  createPage,
  getPage,
  getPublishedPage,
  publishVersion,
  savePage,
  SlugTakenError,
  unpublishPage,
} from "@/lib/pages/service";
import { pageInputSchema } from "@/lib/blocks/schemas";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pages & versions", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const suffix = Math.random().toString(36).slice(2, 8);
  let A: string, B: string, userId: string;
  const input = (heading: string) =>
    pageInputSchema.parse({
      title: "בית",
      blocks: [{ id: "h", type: "hero", heading }],
    });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    userId = (
      await db
        .insert(schema.users)
        .values({ email: `pg-${suffix}@t.test`, name: "p" })
        .returning()
    )[0].id;
    A = (
      await createStoreForUser(userId, { name: "A", slug: `pa-${suffix}` }, db)
    ).id;
    B = (
      await createStoreForUser(userId, { name: "B", slug: `pb-${suffix}` }, db)
    ).id;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("each save creates a version; publish points at a version; rollback = publish older", async () => {
    const page = await createPage(A, { slug: "home", title: "בית" }, db);
    const v1 = await savePage(A, page.id, input("גרסה 1"), "user", db);
    const v2 = await savePage(A, page.id, input("גרסה 2"), "user", db);
    expect((await getPage(A, page.id, db))?.versions).toHaveLength(2);

    expect(await getPublishedPage(A, "home", db)).toBeNull(); // nothing published yet

    await publishVersion(A, page.id, v2.id, db);
    expect((await getPublishedPage(A, "home", db))?.blocks[0]).toMatchObject({
      heading: "גרסה 2",
    });

    await publishVersion(A, page.id, v1.id, db); // rollback
    expect((await getPublishedPage(A, "home", db))?.blocks[0]).toMatchObject({
      heading: "גרסה 1",
    });

    await savePage(A, page.id, input("טיוטה חדשה"), "user", db); // saving does not change what's live
    expect((await getPublishedPage(A, "home", db))?.blocks[0]).toMatchObject({
      heading: "גרסה 1",
    });

    await unpublishPage(A, page.id, db);
    expect(await getPublishedPage(A, "home", db)).toBeNull();
  });

  it("rejects duplicate slugs per store but allows the same slug in another store", async () => {
    await createPage(A, { slug: "about", title: "אודות" }, db);
    await expect(
      createPage(A, { slug: "about", title: "x" }, db),
    ).rejects.toBeInstanceOf(SlugTakenError);
    await expect(
      createPage(B, { slug: "about", title: "אודות B" }, db),
    ).resolves.toBeTruthy();
  });

  it("isolates pages between stores and refuses cross-store publish", async () => {
    const pa = await createPage(A, { slug: `iso-${suffix}`, title: "A" }, db);
    const va = await savePage(A, pa.id, input("secret"), "user", db);
    expect(await getPage(B, pa.id, db)).toBeNull();
    await expect(
      savePage(B, pa.id, input("hack"), "user", db),
    ).rejects.toThrow();
    await expect(publishVersion(B, pa.id, va.id, db)).rejects.toThrow();
    // composite FK: a version cannot reference another store's page
    await expect(
      db
        .insert(schema.pageVersions)
        .values({ storeId: B, pageId: pa.id, blocks: [] }),
    ).rejects.toThrow();
  });
});
