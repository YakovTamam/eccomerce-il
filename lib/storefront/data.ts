import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  categories,
  productVariants,
  products,
  storeDomains,
  stores,
  pages,
} from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { findStoreByKeyAnyStatus } from "@/lib/tenancy/stores";
import { getPublishedPage } from "@/lib/pages/service";
import { readTheme, type Theme } from "@/lib/theme/theme";
import { getDb } from "@/lib/db/client";

/**
 * Cached storefront reads (spec §11: ISR with revalidate by tag `store:<id>` / `product:<id>`).
 * Mutations in the dashboard call lib/storefront/revalidate.ts. Everything returned is plain JSON.
 */

export type StorefrontStore = {
  id: string;
  slug: string;
  name: string;
  theme: Theme;
  primaryDomain: string | null;
};

export async function getStorefrontStore(
  key: string,
): Promise<StorefrontStore | null> {
  "use cache";
  cacheLife("hours");
  const found = await findStoreByKeyAnyStatus(key);
  if (!found) return null;
  const id = found.id;
  cacheTag(`store:${id}`); // tagged even when suspended, so activation invalidates the cached "not found"
  if (found.status !== "active") return null;
  const row = await withStore(id, async (tx) => {
    const [s] = await tx.select().from(stores).where(eq(stores.id, id));
    return s;
  });
  if (!row) return null;
  // Domains are platform metadata; read with the owner connection but only verified+primary.
  const [dom] = await getDb()
    .select({
      hostname: storeDomains.hostname,
      verifiedAt: storeDomains.verifiedAt,
    })
    .from(storeDomains)
    .where(and(eq(storeDomains.storeId, id), eq(storeDomains.isPrimary, true)));
  return {
    id,
    slug: row.slug,
    name: row.name,
    theme: readTheme(row.settings),
    primaryDomain: dom?.verifiedAt ? dom.hostname : null,
  };
}

export async function getNav(storeId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  return withStore(storeId, (tx) =>
    tx
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name)),
  );
}

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  image: { url: string; alt: string } | null;
  priceAgorot: number;
  compareAtAgorot: number | null;
  inStock: boolean;
  hasMultiplePrices: boolean;
};

const cardSelect = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  images: products.images,
  priceAgorot: sql<number>`min(${productVariants.priceAgorot})::int`,
  maxPriceAgorot: sql<number>`max(${productVariants.priceAgorot})::int`,
  compareAtAgorot: sql<
    number | null
  >`min(${productVariants.compareAtAgorot})::int`,
  inStock: sql<boolean>`coalesce(bool_or(not ${productVariants.trackStock} or ${productVariants.stockQty} > 0), false)`,
};

type CardRow = {
  id: string;
  slug: string;
  title: string;
  images: { url: string; alt: string }[];
  priceAgorot: number;
  maxPriceAgorot: number;
  compareAtAgorot: number | null;
  inStock: boolean;
};

const toCard = (r: CardRow): ProductCardData => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  image: r.images[0] ?? null,
  priceAgorot: r.priceAgorot,
  compareAtAgorot: r.compareAtAgorot,
  inStock: r.inStock,
  hasMultiplePrices: r.maxPriceAgorot !== r.priceAgorot,
});

export async function getProductCards(
  storeId: string,
  source:
    | { by: "all" }
    | { by: "category"; categoryId: string }
    | { by: "products"; productIds: string[] },
  limit: number,
): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  const rows = await withStore(storeId, (tx) => {
    const filters = [eq(products.status, "active")];
    if (source.by === "category")
      filters.push(eq(products.categoryId, source.categoryId));
    if (source.by === "products")
      filters.push(inArray(products.id, source.productIds));
    return tx
      .select(cardSelect)
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(...filters))
      .groupBy(products.id)
      .orderBy(desc(products.createdAt))
      .limit(limit);
  });
  const cards = rows.map(toCard);
  if (source.by === "products") {
    // keep the merchant's chosen order
    const order = new Map(source.productIds.map((id, i) => [id, i]));
    cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  return cards;
}

export async function getProductBySlug(storeId: string, slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  return withStore(storeId, async (tx) => {
    const [p] = await tx
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.status, "active")));
    if (!p) return null;
    cacheTag(`product:${p.id}`);
    const variants = await tx
      .select({
        id: productVariants.id,
        title: productVariants.title,
        priceAgorot: productVariants.priceAgorot,
        compareAtAgorot: productVariants.compareAtAgorot,
        inStock: sql<boolean>`(not ${productVariants.trackStock} or ${productVariants.stockQty} > 0)`,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, p.id))
      .orderBy(asc(productVariants.position), asc(productVariants.title));
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      descriptionMd: p.descriptionMd,
      images: p.images,
      variants,
    };
  });
}

export async function getCategoryBySlug(storeId: string, slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  return withStore(storeId, async (tx) => {
    const [c] = await tx
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      })
      .from(categories)
      .where(eq(categories.slug, slug));
    return c ?? null;
  });
}

export async function getPublishedPageCached(storeId: string, slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  return getPublishedPage(storeId, slug);
}

export async function getSitemapData(storeId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`store:${storeId}`);
  return withStore(storeId, async (tx) => ({
    products: await tx
      .select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.status, "active")),
    categories: await tx.select({ slug: categories.slug }).from(categories),
    pages: await tx
      .select({ slug: pages.slug, updatedAt: pages.updatedAt })
      .from(pages)
      .where(eq(pages.status, "published")),
  }));
}
