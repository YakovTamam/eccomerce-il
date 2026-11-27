import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { categories, productVariants, products } from "@/lib/db/schema";
import { withStore, type StoreTx } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { productSlug } from "./slugify";
import { slugifyCategory } from "./category-slug";
import type { ProductInput } from "./schemas";

/** All functions here are tenant-scoped: they run inside withStore (RLS). */

export class NotFoundError extends Error {}
export class InvalidReferenceError extends Error {}

async function assertCategory(tx: StoreTx, categoryId: string | null) {
  if (!categoryId) return;
  const [c] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (!c) throw new InvalidReferenceError("category");
}

async function uniqueProductSlug(
  tx: StoreTx,
  storeId: string,
  title: string,
  ignoreId?: string,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = productSlug(title, attempt > 0);
    const [hit] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.slug, slug)));
    if (!hit || hit.id === ignoreId) return slug;
  }
  throw new Error("could not allocate product slug");
}

const variantValues = (
  storeId: string,
  productId: string,
  v: ProductInput["variants"][number],
  position: number,
) => ({
  storeId,
  productId,
  sku: v.sku,
  title: v.title,
  options: v.options,
  priceAgorot: v.priceAgorot,
  compareAtAgorot: v.compareAtAgorot,
  stockQty: v.stockQty,
  trackStock: v.trackStock,
  position,
});

export function createProduct(storeId: string, input: ProductInput, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      await assertCategory(tx, input.categoryId);
      const slug = await uniqueProductSlug(tx, storeId, input.title);
      const [p] = await tx
        .insert(products)
        .values({
          storeId,
          title: input.title,
          slug,
          descriptionMd: input.descriptionMd,
          status: input.status,
          categoryId: input.categoryId,
          images: input.images,
        })
        .returning();
      await tx
        .insert(productVariants)
        .values(
          input.variants.map((v, i) => variantValues(storeId, p.id, v, i)),
        );
      return p;
    },
    db,
  );
}

export function updateProduct(
  storeId: string,
  productId: string,
  input: ProductInput,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId));
      if (!existing) throw new NotFoundError("product");
      await assertCategory(tx, input.categoryId);
      await tx
        .update(products)
        .set({
          title: input.title,
          descriptionMd: input.descriptionMd,
          status: input.status,
          categoryId: input.categoryId,
          images: input.images,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      // Sync variants: update the ones that carry an id of this product, insert new, delete removed.
      const current = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, productId));
      const currentIds = new Set(current.map((c) => c.id));
      const keep = new Set<string>();
      for (const [i, v] of input.variants.entries()) {
        if (v.id && currentIds.has(v.id)) {
          keep.add(v.id);
          await tx
            .update(productVariants)
            .set(variantValues(storeId, productId, v, i))
            .where(eq(productVariants.id, v.id));
        } else {
          await tx
            .insert(productVariants)
            .values(variantValues(storeId, productId, v, i));
        }
      }
      const removed = [...currentIds].filter((id) => !keep.has(id));
      if (removed.length)
        await tx
          .delete(productVariants)
          .where(inArray(productVariants.id, removed));
      return existing;
    },
    db,
  );
}

export function getProduct(storeId: string, productId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [p] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId));
      if (!p) return null;
      const variants = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(asc(productVariants.position), asc(productVariants.title));
      return { ...p, variants };
    },
    db,
  );
}

export function listProducts(storeId: string, db?: Db) {
  return withStore(
    storeId,
    (tx) =>
      tx
        .select({
          id: products.id,
          title: products.title,
          status: products.status,
          images: products.images,
          categoryName: categories.name,
          variantCount: sql<number>`count(${productVariants.id})::int`,
          minPriceAgorot: sql<number>`coalesce(min(${productVariants.priceAgorot}), 0)::int`,
          totalStock: sql<number>`coalesce(sum(${productVariants.stockQty}) filter (where ${productVariants.trackStock}), 0)::int`,
        })
        .from(products)
        .leftJoin(productVariants, eq(productVariants.productId, products.id))
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .groupBy(products.id, categories.name)
        .orderBy(desc(products.createdAt)),
    db,
  );
}

export function listCategories(storeId: string, db?: Db) {
  return withStore(
    storeId,
    (tx) =>
      tx
        .select()
        .from(categories)
        .orderBy(asc(categories.position), asc(categories.name)),
    db,
  );
}

export function createCategory(storeId: string, name: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      let slug = slugifyCategory(name);
      for (let i = 0; i < 5; i++) {
        const [hit] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, slug));
        if (!hit) break;
        slug = slugifyCategory(name, true);
      }
      const [c] = await tx
        .insert(categories)
        .values({ storeId, name, slug })
        .returning();
      return c;
    },
    db,
  );
}

export function deleteCategory(storeId: string, categoryId: string, db?: Db) {
  return withStore(
    storeId,
    (tx) =>
      tx
        .delete(categories)
        .where(eq(categories.id, categoryId))
        .returning({ id: categories.id }),
    db,
  );
}
