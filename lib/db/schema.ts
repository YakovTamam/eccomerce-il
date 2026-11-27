import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  numeric,
  primaryKey,
  index,
  integer,
  unique,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Auth (Better Auth) ─ platform-level tables, NOT tenant data (no RLS) ──────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Tenancy ───────────────────────────────────────────────────────────────────
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  plan: text("plan", { enum: ["basic", "pro", "growth"] })
    .notNull()
    .default("basic"),
  currency: text("currency").notNull().default("ILS"),
  vatRate: numeric("vat_rate", { precision: 4, scale: 3 })
    .notNull()
    .default("0.18"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const storeMembers = pgTable(
  "store_members",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "staff"] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.userId] }),
    index("store_members_user_idx").on(t.userId),
  ],
);

export const storeDomains = pgTable("store_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  isPrimary: boolean("is_primary").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

// ── Catalog (tenant tables: RLS, see drizzle/0004) ────────────────────────────
export type ProductImage = { url: string; alt: string };

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: uuid("parent_id"),
    position: integer("position").notNull().default(0),
  },
  (t) => [unique("categories_store_slug_uq").on(t.storeId, t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    status: text("status", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("draft"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    images: jsonb("images").$type<ProductImage[]>().notNull().default([]),
    seo: jsonb("seo").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("products_store_slug_uq").on(t.storeId, t.slug),
    unique("products_store_id_uq").on(t.storeId, t.id), // target for composite FKs
    index("products_store_status_idx").on(t.storeId, t.status),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    sku: text("sku"),
    title: text("title").notNull(),
    options: jsonb("options")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    priceAgorot: integer("price_agorot").notNull(),
    compareAtAgorot: integer("compare_at_agorot"),
    stockQty: integer("stock_qty").notNull().default(0),
    trackStock: boolean("track_stock").notNull().default(true),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    // A variant can only point at a product of the SAME store.
    foreignKey({
      columns: [t.storeId, t.productId],
      foreignColumns: [products.storeId, products.id],
      name: "product_variants_store_product_fk",
    }).onDelete("cascade"),
    uniqueIndex("product_variants_store_sku_uq")
      .on(t.storeId, t.sku)
      .where(sql`${t.sku} is not null`),
    index("product_variants_product_idx").on(t.productId),
    check("product_variants_price_nonneg", sql`${t.priceAgorot} >= 0`),
    check(
      "product_variants_compare_nonneg",
      sql`${t.compareAtAgorot} is null or ${t.compareAtAgorot} >= 0`,
    ),
    check("product_variants_stock_nonneg", sql`${t.stockQty} >= 0`),
  ],
);

// ── Pages (block builder) — tenant tables, RLS in drizzle/0007 ────────────────
export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(), // "home" is the storefront home page
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]), // working copy
    seo: jsonb("seo")
      .$type<{ title?: string; description?: string }>()
      .notNull()
      .default({}),
    publishedVersionId: uuid("published_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("pages_store_slug_uq").on(t.storeId, t.slug),
    unique("pages_store_id_uq").on(t.storeId, t.id),
  ],
);

export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").notNull(),
    blocks: jsonb("blocks").$type<unknown[]>().notNull(),
    createdBy: text("created_by", { enum: ["user", "mcp"] })
      .notNull()
      .default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.storeId, t.pageId],
      foreignColumns: [pages.storeId, pages.id],
      name: "page_versions_store_page_fk",
    }).onDelete("cascade"),
    index("page_versions_page_idx").on(t.pageId, t.createdAt),
    unique("page_versions_store_id_uq").on(t.storeId, t.id),
  ],
);
