import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { createStoreForUser } from "@/lib/tenancy/stores";
import {
  createCategory,
  createProduct,
  getProduct,
  InvalidReferenceError,
  listProducts,
  updateProduct,
} from "@/lib/catalog/service";
import { parseProductForm } from "@/lib/catalog/schemas";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("catalog (tenant-scoped)", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const suffix = Math.random().toString(36).slice(2, 8);
  let A: string, B: string, userId: string;

  const input = (title: string, extra: object = {}) => {
    const r = parseProductForm({
      title,
      status: "active",
      images: [{ url: "/uploads/x/a.png", alt: "תמונה" }],
      variants: [
        { title: "S", price: "20", stockQty: 5 },
        { title: "L", price: "35.5", stockQty: 3 },
      ],
      ...extra,
    });
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    userId = (
      await db
        .insert(schema.users)
        .values({ email: `cat-${suffix}@t.test`, name: "c" })
        .returning()
    )[0].id;
    A = (
      await createStoreForUser(userId, { name: "A", slug: `ca-${suffix}` }, db)
    ).id;
    B = (
      await createStoreForUser(userId, { name: "B", slug: `cb-${suffix}` }, db)
    ).id;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("creates a product with 2 variants and an image, stored with the right store_id", async () => {
    const p = await createProduct(A, input("חלה"), db);
    const full = await getProduct(A, p.id, db);
    expect(full?.storeId).toBe(A);
    expect(full?.images).toEqual([{ url: "/uploads/x/a.png", alt: "תמונה" }]);
    expect(full?.variants).toHaveLength(2);
    expect(full?.variants.every((v) => v.storeId === A)).toBe(true);
    expect(full?.variants.map((v) => v.priceAgorot).sort()).toEqual([
      2000, 3550,
    ]);
    // raw check as owner: no row leaked to the other store
    const raw = await db
      .select()
      .from(schema.productVariants)
      .where(eq(schema.productVariants.productId, p.id));
    expect(raw.map((r) => r.storeId)).toEqual([A, A]);
  });

  it("store B cannot see or modify store A's products", async () => {
    const p = await createProduct(A, input("מוצר פרטי"), db);
    expect(await getProduct(B, p.id, db)).toBeNull();
    expect(
      (await listProducts(B, db)).find((x) => x.id === p.id),
    ).toBeUndefined();
    await expect(updateProduct(B, p.id, input("hacked"), db)).rejects.toThrow();
    expect((await getProduct(A, p.id, db))?.title).toBe("מוצר פרטי");
  });

  it("DB refuses a variant that points at another store's product (composite FK)", async () => {
    const p = await createProduct(A, input("fk"), db);
    await expect(
      db.insert(schema.productVariants).values({
        storeId: B,
        productId: p.id,
        title: "x",
        priceAgorot: 100,
        stockQty: 1,
      }),
    ).rejects.toThrow();
  });

  it("DB enforces non-negative stock/price", async () => {
    const p = await createProduct(A, input("chk"), db);
    await expect(
      withStore(
        A,
        (tx) =>
          tx.insert(schema.productVariants).values({
            storeId: A,
            productId: p.id,
            title: "neg",
            priceAgorot: 100,
            stockQty: -1,
          }),
        db,
      ),
    ).rejects.toThrow();
  });

  it("rejects a category from another store", async () => {
    const cat = await createCategory(B, "קטגוריה של B", db);
    await expect(
      createProduct(A, input("xx", { categoryId: cat.id }), db),
    ).rejects.toBeInstanceOf(InvalidReferenceError);
  });

  it("updates: edits stock/price, adds and removes variants", async () => {
    const p = await createProduct(A, input("upd"), db);
    const cur = (await getProduct(A, p.id, db))!;
    const [v1] = cur.variants;
    const r = parseProductForm({
      title: "upd2",
      status: "active",
      images: [],
      variants: [
        { id: v1.id, title: v1.title, price: "99", stockQty: 42 },
        { title: "XL", price: "50", stockQty: 1 },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    await updateProduct(A, p.id, r.data, db);
    const after = (await getProduct(A, p.id, db))!;
    expect(after.title).toBe("upd2");
    expect(after.variants).toHaveLength(2);
    const edited = after.variants.find((v) => v.id === v1.id)!;
    expect([edited.priceAgorot, edited.stockQty]).toEqual([9900, 42]);
    expect(after.variants.some((v) => v.title === "XL")).toBe(true);
  });

  it("listProducts aggregates price and stock", async () => {
    const p = await createProduct(A, input("agg"), db);
    const row = (await listProducts(A, db)).find((x) => x.id === p.id)!;
    expect([row.variantCount, row.minPriceAgorot, row.totalStock]).toEqual([
      2, 2000, 8,
    ]);
  });
});
