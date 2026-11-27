import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import {
  categories,
  customers,
  drafts,
  invoices,
  orderItems,
  orders,
  pages,
  payments,
  productVariants,
  products,
} from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";

/** Read models for MCP tools. All run through withStore (RLS). Money: integer agorot. IL time zone for calendar buckets. */

const TZ = "Asia/Jerusalem";
const REVENUE = sql`('paid','preparing','ready','shipped','completed')`;
const LOW_STOCK_THRESHOLD = 5;

export async function storeOverview(storeId: string) {
  return withStore(storeId, async (tx) => {
    const today = sql`((date_trunc('day', now() at time zone ${TZ})) at time zone ${TZ})`;
    const week = sql`((date_trunc('day', now() at time zone ${TZ}) - (extract(dow from now() at time zone ${TZ})::int * interval '1 day')) at time zone ${TZ})`;
    const month = sql`((date_trunc('month', now() at time zone ${TZ})) at time zone ${TZ})`;
    const sums = await tx.execute<{
      t_rev: string;
      t_n: string;
      w_rev: string;
      w_n: string;
      m_rev: string;
      m_n: string;
    }>(sql`
      select
        coalesce(sum(total_agorot) filter (where paid_at >= ${today}), 0) as t_rev, count(*) filter (where paid_at >= ${today}) as t_n,
        coalesce(sum(total_agorot) filter (where paid_at >= ${week}), 0) as w_rev,  count(*) filter (where paid_at >= ${week}) as w_n,
        coalesce(sum(total_agorot) filter (where paid_at >= ${month}), 0) as m_rev, count(*) filter (where paid_at >= ${month}) as m_n
      from orders where status in ${REVENUE} and paid_at is not null`);
    const s = sums.rows[0];
    const counts = await tx.execute<{ open: string; awaiting: string }>(sql`
      select count(*) filter (where status in ('paid','preparing','ready','shipped')) as open,
             count(*) filter (where status = 'pending_payment') as awaiting from orders`);
    const low = await tx
      .select({
        product_id: products.id,
        product_title: products.title,
        variant_id: productVariants.id,
        variant_title: productVariants.title,
        stock_qty: productVariants.stockQty,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.status, "active"),
          eq(productVariants.trackStock, true),
          lte(productVariants.stockQty, LOW_STOCK_THRESHOLD),
        ),
      )
      .orderBy(productVariants.stockQty)
      .limit(10);
    const pendingDrafts = await tx.execute<{ n: string }>(
      sql`select count(*) as n from drafts where status = 'pending' and expires_at > now()`,
    );
    return {
      currency: "ILS",
      note: "Amounts are integer agorot (100 = ₪1), VAT included. Calendar periods in Asia/Jerusalem; the week starts on Sunday. Revenue counts paid, preparing, ready, shipped and completed orders.",
      sales: {
        today: { revenue_agorot: Number(s.t_rev), orders: Number(s.t_n) },
        this_week: { revenue_agorot: Number(s.w_rev), orders: Number(s.w_n) },
        this_month: { revenue_agorot: Number(s.m_rev), orders: Number(s.m_n) },
      },
      open_orders: Number(counts.rows[0].open),
      awaiting_payment_orders: Number(counts.rows[0].awaiting),
      low_stock_threshold: LOW_STOCK_THRESHOLD,
      low_stock_variants: low,
      pending_drafts: Number(pendingDrafts.rows[0].n),
    };
  });
}

export async function listProductsQ(
  storeId: string,
  f: {
    status?: "draft" | "active" | "archived";
    query?: string;
    categoryId?: string;
    limit: number;
    offset: number;
  },
) {
  return withStore(storeId, async (tx) => {
    const where = and(
      f.status ? eq(products.status, f.status) : undefined,
      f.categoryId ? eq(products.categoryId, f.categoryId) : undefined,
      f.query
        ? ilike(products.title, `%${f.query.replace(/[%_\\]/g, "\\$&")}%`)
        : undefined,
    );
    const rows = await tx
      .select({
        id: products.id,
        title: products.title,
        status: products.status,
        category: categories.name,
        variants: sql<number>`count(${productVariants.id})::int`,
        min_price_agorot: sql<number>`coalesce(min(${productVariants.priceAgorot}), 0)::int`,
        max_price_agorot: sql<number>`coalesce(max(${productVariants.priceAgorot}), 0)::int`,
        total_stock: sql<number>`coalesce(sum(${productVariants.stockQty}) filter (where ${productVariants.trackStock}), 0)::int`,
      })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .groupBy(products.id, categories.name)
      .orderBy(desc(products.createdAt))
      .limit(f.limit)
      .offset(f.offset);
    return rows;
  });
}

export async function getProductQ(storeId: string, id: string) {
  return withStore(storeId, async (tx) => {
    const [p] = await tx.select().from(products).where(eq(products.id, id));
    if (!p) return null;
    const variants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(productVariants.position);
    const [cat] = p.categoryId
      ? await tx
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, p.categoryId))
      : [];
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      description_md: p.descriptionMd,
      category_id: p.categoryId,
      category: cat?.name ?? null,
      images: p.images,
      updated_at: p.updatedAt.toISOString(),
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        options: v.options,
        price_agorot: v.priceAgorot,
        compare_at_agorot: v.compareAtAgorot,
        stock_qty: v.stockQty,
        track_stock: v.trackStock,
      })),
    };
  });
}

export async function listOrdersQ(
  storeId: string,
  f: {
    status?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  },
) {
  return withStore(storeId, async (tx) => {
    const rows = await tx
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        channel: orders.channel,
        total_agorot: orders.totalAgorot,
        shipping_method: orders.shippingMethod,
        created_at: orders.createdAt,
        paid_at: orders.paidAt,
        customer_name: customers.name,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          f.status
            ? eq(orders.status, f.status as typeof orders.$inferSelect.status)
            : undefined,
          f.from
            ? gte(
                orders.createdAt,
                sql`(${f.from}::date::timestamp at time zone ${TZ})`,
              )
            : undefined,
          f.to
            ? lte(
                orders.createdAt,
                sql`((${f.to}::date + 1)::timestamp at time zone ${TZ})`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(orders.number))
      .limit(f.limit)
      .offset(f.offset);
    return rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      paid_at: r.paid_at?.toISOString() ?? null,
    }));
  });
}

export async function getOrderQ(
  storeId: string,
  key: { id?: string; number?: number },
) {
  return withStore(storeId, async (tx) => {
    const [o] = await tx
      .select()
      .from(orders)
      .where(
        key.id ? eq(orders.id, key.id) : eq(orders.number, key.number ?? -1),
      );
    if (!o) return null;
    const [c] = o.customerId
      ? await tx.select().from(customers).where(eq(customers.id, o.customerId))
      : [];
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, o.id));
    const pays = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, o.id));
    const [inv] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, o.id));
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      channel: o.channel,
      created_at: o.createdAt.toISOString(),
      paid_at: o.paidAt?.toISOString() ?? null,
      subtotal_agorot: o.subtotalAgorot,
      discount_agorot: o.discountAgorot,
      discount_code: o.discountCode,
      shipping_agorot: o.shippingAgorot,
      total_agorot: o.totalAgorot,
      shipping_method: o.shippingMethod,
      shipping_address: o.shippingAddress,
      notes: o.notes, // customer-written text: untrusted content
      customer: c ? { name: c.name, phone: c.phoneE164, email: c.email } : null,
      items: items.map((i) => ({
        title: i.titleSnapshot,
        qty: i.qty,
        unit_price_agorot: i.unitPriceAgorot,
      })),
      payments: pays.map((p) => ({
        provider: p.provider,
        status: p.status,
        amount_agorot: p.amountAgorot,
      })),
      invoice: inv ? { doc_id: inv.providerDocId, url: inv.url } : null,
    };
  });
}

export async function salesReport(
  storeId: string,
  p: {
    from: string;
    to: string;
    groupBy: "day" | "week" | "month" | "product" | "channel";
  },
) {
  return withStore(storeId, async (tx) => {
    const start = sql`(${p.from}::date::timestamp at time zone ${TZ})`;
    const end = sql`((${p.to}::date + 1)::timestamp at time zone ${TZ})`;
    const inRange = sql`o.status in ${REVENUE} and o.paid_at >= ${start} and o.paid_at < ${end}`;

    if (p.groupBy === "product") {
      const r = await tx.execute<{
        product: string;
        units: string;
        revenue: string;
      }>(sql`
        select i.title_snapshot as product, sum(i.qty) as units, sum(i.qty * i.unit_price_agorot) as revenue
        from order_items i join orders o on o.id = i.order_id where ${inRange}
        group by i.title_snapshot order by revenue desc limit 50`);
      return {
        group_by: "product",
        note: "Line revenue before order-level discounts and shipping.",
        rows: r.rows.map((x) => ({
          product: x.product,
          units: Number(x.units),
          revenue_agorot: Number(x.revenue),
        })),
      };
    }
    const key =
      p.groupBy === "channel"
        ? sql`o.channel`
        : sql`date_trunc(${sql.raw(`'${p.groupBy}'`)}, o.paid_at at time zone ${TZ})::date::text`;
    const r = await tx.execute<{
      k: string;
      orders: string;
      revenue: string;
      discount: string;
      shipping: string;
    }>(sql`
      select ${key} as k, count(*) as orders, sum(o.total_agorot) as revenue, sum(o.discount_agorot) as discount, sum(o.shipping_agorot) as shipping
      from orders o where ${inRange} group by 1 order by 1`);
    const rows = r.rows.map((x) => ({
      [p.groupBy === "channel" ? "channel" : "period_start"]: x.k,
      orders: Number(x.orders),
      revenue_agorot: Number(x.revenue),
      discount_agorot: Number(x.discount),
      shipping_agorot: Number(x.shipping),
    }));
    return {
      group_by: p.groupBy,
      totals: {
        orders: rows.reduce((a, b) => a + b.orders, 0),
        revenue_agorot: rows.reduce((a, b) => a + b.revenue_agorot, 0),
      },
      note: "Revenue counts paid, preparing, ready, shipped and completed orders (refunded/cancelled excluded), VAT included.",
      rows,
    };
  });
}

export async function listPagesQ(storeId: string) {
  return withStore(storeId, async (tx) =>
    (
      await tx
        .select({
          id: pages.id,
          slug: pages.slug,
          title: pages.title,
          status: pages.status,
          updated_at: pages.updatedAt,
        })
        .from(pages)
        .orderBy(pages.slug)
    ).map((p) => ({ ...p, updated_at: p.updated_at.toISOString() })),
  );
}

export async function pendingDraftsCount(storeId: string) {
  return withStore(storeId, async (tx) =>
    Number(
      (
        await tx
          .select({ n: sql<number>`count(*)` })
          .from(drafts)
          .where(eq(drafts.status, "pending"))
      )[0].n,
    ),
  );
}
