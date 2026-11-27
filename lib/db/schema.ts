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

// ── Commerce (tenant tables, RLS in drizzle/0009) ─────────────────────────────
export type CartItem = { variantId: string; qty: number };
export type ShippingAddress = {
  street: string;
  city: string;
  zip?: string;
  notes?: string;
};

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phoneE164: text("phone_e164").notNull(),
    email: text("email"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    optInAt: timestamp("opt_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("customers_store_phone_uq").on(t.storeId, t.phoneE164)],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    channel: text("channel", { enum: ["web", "whatsapp"] })
      .notNull()
      .default("web"),
    status: text("status", { enum: ["open", "converted", "abandoned"] })
      .notNull()
      .default("open"),
    // Only variant ids + quantities: prices are ALWAYS recomputed on the server.
    items: jsonb("items").$type<CartItem[]>().notNull().default([]),
    discountCode: text("discount_code"),
    shippingMethod: text("shipping_method", { enum: ["pickup", "delivery"] }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("carts_store_id_uq").on(t.storeId, t.id)],
);

export const storeCounters = pgTable(
  "store_counters",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.name] })],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    number: integer("number").notNull(), // running per store
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    cartId: uuid("cart_id"),
    channel: text("channel", { enum: ["web", "whatsapp", "mcp"] })
      .notNull()
      .default("web"),
    status: text("status", {
      enum: [
        "pending_payment",
        "paid",
        "preparing",
        "ready",
        "shipped",
        "completed",
        "cancelled",
        "refunded",
      ],
    })
      .notNull()
      .default("pending_payment"),
    subtotalAgorot: integer("subtotal_agorot").notNull(),
    discountAgorot: integer("discount_agorot").notNull().default(0),
    shippingAgorot: integer("shipping_agorot").notNull().default(0),
    totalAgorot: integer("total_agorot").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(), // snapshot, basis points (1800 = 18%)
    discountCode: text("discount_code"),
    shippingMethod: text("shipping_method", {
      enum: ["pickup", "delivery"],
    }).notNull(),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress | null>(),
    notes: text("notes").notNull().default(""),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("orders_store_number_uq").on(t.storeId, t.number),
    unique("orders_store_id_uq").on(t.storeId, t.id),
    index("orders_store_status_idx").on(t.storeId, t.status, t.createdAt),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotalAgorot} >= 0 and ${t.discountAgorot} >= 0 and ${t.shippingAgorot} >= 0 and ${t.totalAgorot} >= 0`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull(),
    // No FK: catalog rows may change/disappear; the order keeps its own snapshot.
    variantId: uuid("variant_id"),
    titleSnapshot: text("title_snapshot").notNull(),
    unitPriceAgorot: integer("unit_price_agorot").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.storeId, t.orderId],
      foreignColumns: [orders.storeId, orders.id],
      name: "order_items_store_order_fk",
    }).onDelete("cascade"),
    index("order_items_order_idx").on(t.orderId),
    check(
      "order_items_qty_pos",
      sql`${t.qty} > 0 and ${t.unitPriceAgorot} >= 0`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    status: text("status", { enum: ["pending", "paid", "failed", "refunded"] })
      .notNull()
      .default("pending"),
    amountAgorot: integer("amount_agorot").notNull(),
    raw: jsonb("raw").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.storeId, t.orderId],
      foreignColumns: [orders.storeId, orders.id],
      name: "payments_store_order_fk",
    }).onDelete("cascade"),
    unique("payments_provider_ref_uq").on(t.provider, t.providerRef), // webhook idempotency
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull(),
    provider: text("provider").notNull(),
    providerDocId: text("provider_doc_id").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.storeId, t.orderId],
      foreignColumns: [orders.storeId, orders.id],
      name: "invoices_store_order_fk",
    }).onDelete("cascade"),
    unique("invoices_store_order_uq").on(t.storeId, t.orderId), // one invoice per order
  ],
);

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // stored UPPERCASE
    type: text("type", {
      enum: ["percent", "fixed", "free_shipping"],
    }).notNull(),
    value: integer("value").notNull().default(0), // percent 1-100, or agorot for "fixed"
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("discounts_store_code_uq").on(t.storeId, t.code),
    check(
      "discounts_value_ok",
      sql`${t.value} >= 0 and (${t.type} <> 'percent' or ${t.value} <= 100)`,
    ),
  ],
);

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    dedupeKey: text("dedupe_key"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    status: text("status", { enum: ["pending", "done", "failed"] })
      .notNull()
      .default("pending"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("outbox_pending_idx").on(t.status, t.runAt),
    unique("outbox_dedupe_uq").on(t.storeId, t.dedupeKey), // enqueue is idempotent
  ],
);
