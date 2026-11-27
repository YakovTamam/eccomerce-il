import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";

/**
 * PLATFORM-LEVEL reads (owner connection, across stores) for the super-admin panel.
 * Constraints (ADR 0007): only store metadata and aggregates — never customer contact data,
 * order contents, or secrets. Callers must be gated by requirePlatformAdmin().
 */

const TZ = "Asia/Jerusalem";
const REVENUE = sql`('paid','preparing','ready','shipped','completed')`;
const num = (v: unknown) => Number(v ?? 0);

export type DayPoint = { day: string; gmvAgorot: number; orders: number };

async function gmvSeries(
  db: Db,
  days: number,
  storeId?: string,
): Promise<DayPoint[]> {
  const r = await db.execute<{ day: string; gmv: string; orders: string }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(o.total_agorot), 0) as gmv, count(o.id) as orders
    from generate_series(date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${days - 1}), date_trunc('day', now() at time zone ${TZ}), interval '1 day') as d
    left join orders o on date_trunc('day', o.paid_at at time zone ${TZ}) = d and o.status in ${REVENUE}
      ${storeId ? sql`and o.store_id = ${storeId}` : sql``}
    group by d order by d`);
  return r.rows.map((x) => ({
    day: x.day,
    gmvAgorot: num(x.gmv),
    orders: num(x.orders),
  }));
}

export async function adminOverview(db: Db = getDb()) {
  const [stores, series, prev, health, recent] = await Promise.all([
    db.execute<{
      total: string;
      active: string;
      suspended: string;
      new30: string;
    }>(sql`
      select count(*) as total, count(*) filter (where status='active') as active, count(*) filter (where status='suspended') as suspended,
             count(*) filter (where created_at > now() - interval '30 days') as new30 from stores`),
    gmvSeries(db, 30),
    db.execute<{ gmv: string; orders: string }>(sql`
      select coalesce(sum(total_agorot),0) as gmv, count(*) as orders from orders
      where status in ${REVENUE} and paid_at >= now() - interval '60 days' and paid_at < now() - interval '30 days'`),
    db.execute<Record<string, string>>(sql`
      select
        (select count(*) from outbox_jobs where status='failed') as failed_jobs,
        (select count(*) from outbox_jobs where status='pending' and attempts > 0) as retrying_jobs,
        (select count(*) from payments where status='failed' and created_at > now() - interval '7 days') as failed_payments,
        (select count(*) from oauth_grants where revoked_at is null and refresh_expires_at > now()) as mcp_grants,
        (select count(*) from store_domains where verified_at is null) as unverified_domains,
        (select count(*) from whatsapp_accounts where status='pending') as wa_pending`),
    db.execute<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      created_at: Date;
      owner: string | null;
    }>(sql`
      select s.id, s.name, s.slug, s.plan, s.created_at, u.name as owner
      from stores s left join lateral (select user_id from store_members m where m.store_id = s.id and m.role='owner' limit 1) om on true
      left join users u on u.id = om.user_id order by s.created_at desc limit 6`),
  ]);
  const s = stores.rows[0];
  const h = health.rows[0];
  const gmv30 = series.reduce((a, b) => a + b.gmvAgorot, 0);
  const orders30 = series.reduce((a, b) => a + b.orders, 0);
  return {
    stores: {
      total: num(s.total),
      active: num(s.active),
      suspended: num(s.suspended),
      new30: num(s.new30),
    },
    series,
    gmv30Agorot: gmv30,
    orders30,
    gmvPrevAgorot: num(prev.rows[0].gmv),
    ordersPrev: num(prev.rows[0].orders),
    health: {
      failedJobs: num(h.failed_jobs),
      retryingJobs: num(h.retrying_jobs),
      failedPayments: num(h.failed_payments),
      mcpGrants: num(h.mcp_grants),
      unverifiedDomains: num(h.unverified_domains),
      waPending: num(h.wa_pending),
    },
    recentStores: recent.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      plan: r.plan,
      createdAt: new Date(r.created_at),
      owner: r.owner,
    })),
  };
}

export type StoreSort = "created" | "gmv" | "orders" | "name";
export type StoreFilters = {
  q?: string;
  status?: "active" | "suspended";
  plan?: "basic" | "pro" | "growth";
  sort?: StoreSort;
  page?: number;
  pageSize?: number;
};

export type StoreRow = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  plan: "basic" | "pro" | "growth";
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
  orders30: number;
  gmv30Agorot: number;
  ordersTotal: number;
};

export async function listStoresAdmin(f: StoreFilters, db: Db = getDb()) {
  const pageSize = Math.min(f.pageSize ?? 15, 100);
  const page = Math.max(f.page ?? 1, 1);
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const where = sql`where true
    ${f.status ? sql`and s.status = ${f.status}` : sql``}
    ${f.plan ? sql`and s.plan = ${f.plan}` : sql``}
    ${like ? sql`and (s.name ilike ${like} or s.slug ilike ${like} or u.email ilike ${like} or u.name ilike ${like})` : sql``}`;
  const order = {
    created: sql`s.created_at desc`,
    gmv: sql`gmv30 desc, s.created_at desc`,
    orders: sql`orders30 desc, s.created_at desc`,
    name: sql`s.name asc`,
  }[f.sort ?? "created"];

  const base = sql`
    from stores s
    left join lateral (select user_id from store_members m where m.store_id = s.id and m.role = 'owner' order by m.user_id limit 1) om on true
    left join users u on u.id = om.user_id
    left join lateral (
      select count(*) filter (where o.status in ${REVENUE} and o.paid_at > now() - interval '30 days') as orders30,
             coalesce(sum(o.total_agorot) filter (where o.status in ${REVENUE} and o.paid_at > now() - interval '30 days'), 0) as gmv30,
             count(*) as total
      from orders o where o.store_id = s.id) a on true
    ${where}`;
  const [rows, count] = await Promise.all([
    db.execute<Record<string, string | Date | null>>(sql`
      select s.id, s.slug, s.name, s.status, s.plan, s.created_at, u.name as owner_name, u.email as owner_email,
             coalesce(a.orders30, 0) as orders30, coalesce(a.gmv30, 0) as gmv30, coalesce(a.total, 0) as total
      ${base} order by ${order} limit ${pageSize} offset ${(page - 1) * pageSize}`),
    db.execute<{ n: string }>(sql`select count(*) as n ${base}`),
  ]);
  const total = num(count.rows[0].n);
  return {
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
    rows: rows.rows.map((r): StoreRow => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      status: r.status as StoreRow["status"],
      plan: r.plan as StoreRow["plan"],
      createdAt: new Date(r.created_at as Date),
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
      orders30: num(r.orders30),
      gmv30Agorot: num(r.gmv30),
      ordersTotal: num(r.total),
    })),
  };
}

export async function getStoreAdmin(storeId: string, db: Db = getDb()) {
  const [
    store,
    members,
    domains,
    wa,
    counts,
    series,
    grants,
    platformLog,
    storeLog,
  ] = await Promise.all([
    db.execute<Record<string, string | Date | null>>(
      sql`select id, slug, name, status, plan, currency, created_at from stores where id = ${storeId}`,
    ),
    db.execute<{ name: string; email: string; role: string }>(
      sql`select u.name, u.email, m.role from store_members m join users u on u.id = m.user_id where m.store_id = ${storeId} order by m.role, u.name`,
    ),
    db.execute<{
      id: string;
      hostname: string;
      is_primary: boolean;
      verified_at: Date | null;
    }>(
      sql`select id, hostname, is_primary, verified_at from store_domains where store_id = ${storeId} order by is_primary desc, hostname`,
    ),
    // the access token column is intentionally NOT selected
    db.execute<{
      id: string;
      phone_number_id: string;
      waba_id: string;
      display_phone: string;
      status: string;
      updated_at: Date;
    }>(
      sql`select id, phone_number_id, waba_id, display_phone, status, updated_at from whatsapp_accounts where store_id = ${storeId}`,
    ),
    db.execute<Record<string, string>>(sql`
      select (select count(*) from products where store_id = ${storeId}) as products,
             (select count(*) from products where store_id = ${storeId} and status = 'active') as active_products,
             (select count(*) from orders where store_id = ${storeId}) as orders,
             (select count(*) from orders where store_id = ${storeId} and status in ${REVENUE} and paid_at > now() - interval '30 days') as orders30,
             (select coalesce(sum(total_agorot),0) from orders where store_id = ${storeId} and status in ${REVENUE} and paid_at > now() - interval '30 days') as gmv30,
             (select coalesce(sum(total_agorot),0) from orders where store_id = ${storeId} and status in ${REVENUE}) as gmv_total,
             (select count(*) from pages where store_id = ${storeId} and status = 'published') as published_pages`),
    gmvSeries(db, 30, storeId),
    db.execute<{ n: string }>(
      sql`select count(*) as n from oauth_grants where store_id = ${storeId} and revoked_at is null and refresh_expires_at > now()`,
    ),
    db.execute<{
      action: string;
      details: Record<string, unknown>;
      created_at: Date;
      actor: string | null;
    }>(sql`
      select p.action, p.details, p.created_at, u.name as actor from platform_audit_log p left join users u on u.id = p.actor_user_id
      where p.store_id = ${storeId} order by p.created_at desc limit 8`),
    db.execute<{ action: string; actor_type: string; created_at: Date }>(
      sql`select action, actor_type, created_at from audit_log where store_id = ${storeId} order by created_at desc limit 8`,
    ),
  ]);
  if (!store.rows[0]) return null;
  const s = store.rows[0];
  const c = counts.rows[0];
  return {
    store: {
      id: String(s.id),
      slug: String(s.slug),
      name: String(s.name),
      status: s.status as "active" | "suspended",
      plan: s.plan as "basic" | "pro" | "growth",
      createdAt: new Date(s.created_at as Date),
    },
    members: members.rows,
    domains: domains.rows.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      isPrimary: d.is_primary,
      verifiedAt: d.verified_at ? new Date(d.verified_at) : null,
    })),
    whatsapp: wa.rows[0]
      ? {
          phoneNumberId: wa.rows[0].phone_number_id,
          wabaId: wa.rows[0].waba_id,
          displayPhone: wa.rows[0].display_phone,
          status: wa.rows[0].status as "pending" | "active" | "disabled",
          updatedAt: new Date(wa.rows[0].updated_at),
        }
      : null,
    stats: {
      products: num(c.products),
      activeProducts: num(c.active_products),
      orders: num(c.orders),
      orders30: num(c.orders30),
      gmv30Agorot: num(c.gmv30),
      gmvTotalAgorot: num(c.gmv_total),
      publishedPages: num(c.published_pages),
    },
    series,
    mcpGrants: num(grants.rows[0].n),
    platformLog: platformLog.rows.map((r) => ({
      action: r.action,
      details: r.details,
      createdAt: new Date(r.created_at),
      actor: r.actor,
    })),
    storeLog: storeLog.rows.map((r) => ({
      action: r.action,
      actorType: r.actor_type,
      createdAt: new Date(r.created_at),
    })),
  };
}

export async function listDomainsAdmin(db: Db = getDb()) {
  const r = await db.execute<{
    id: string;
    hostname: string;
    is_primary: boolean;
    verified_at: Date | null;
    store_id: string;
    store_name: string;
    slug: string;
  }>(sql`
    select d.id, d.hostname, d.is_primary, d.verified_at, s.id as store_id, s.name as store_name, s.slug
    from store_domains d join stores s on s.id = d.store_id order by (d.verified_at is null) desc, d.hostname`);
  return r.rows.map((d) => ({
    id: d.id,
    hostname: d.hostname,
    isPrimary: d.is_primary,
    verifiedAt: d.verified_at ? new Date(d.verified_at) : null,
    storeId: d.store_id,
    storeName: d.store_name,
    slug: d.slug,
  }));
}

export async function systemHealth(db: Db = getDb()) {
  const [jobs, failed, payments, infra] = await Promise.all([
    db.execute<{ status: string; n: string }>(
      sql`select status, count(*) as n from outbox_jobs group by status`,
    ),
    db.execute<{
      id: string;
      type: string;
      attempts: number;
      last_error: string | null;
      created_at: Date;
      slug: string;
    }>(sql`
      select j.id, j.type, j.attempts, j.last_error, j.created_at, s.slug from outbox_jobs j join stores s on s.id = j.store_id
      where j.status = 'failed' order by j.created_at desc limit 25`),
    db.execute<{
      id: string;
      provider: string;
      amount_agorot: number;
      created_at: Date;
      number: number;
      slug: string;
      mismatch: boolean;
    }>(sql`
      select p.id, p.provider, p.amount_agorot, p.created_at, o.number, s.slug, (p.raw ? 'mismatch') as mismatch
      from payments p join orders o on o.id = p.order_id join stores s on s.id = p.store_id
      where p.status = 'failed' and p.created_at > now() - interval '7 days' order by p.created_at desc limit 25`),
    db.execute<Record<string, string>>(sql`
      select (select count(*) from oauth_grants where revoked_at is null and refresh_expires_at > now()) as grants,
             (select count(*) from drafts where status='pending' and expires_at > now()) as drafts,
             (select count(*) from rate_limits) as rate_rows`),
  ]);
  const by = Object.fromEntries(jobs.rows.map((r) => [r.status, num(r.n)]));
  return {
    outbox: {
      pending: by.pending ?? 0,
      done: by.done ?? 0,
      failed: by.failed ?? 0,
    },
    failedJobs: failed.rows.map((r) => ({
      id: r.id,
      type: r.type,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: new Date(r.created_at),
      slug: r.slug,
    })),
    failedPayments: payments.rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      amountAgorot: r.amount_agorot,
      createdAt: new Date(r.created_at),
      orderNumber: r.number,
      slug: r.slug,
      amountMismatch: !!r.mismatch,
    })),
    infra: {
      mcpGrants: num(infra.rows[0].grants),
      pendingDrafts: num(infra.rows[0].drafts),
      rateLimitRows: num(infra.rows[0].rate_rows),
    },
  };
}

export async function listAdminAudit(
  opts: { limit?: number } = {},
  db: Db = getDb(),
) {
  const r = await db.execute<{
    id: string;
    action: string;
    details: Record<string, unknown>;
    created_at: Date;
    actor: string | null;
    slug: string | null;
  }>(sql`
    select p.id, p.action, p.details, p.created_at, u.name as actor, s.slug
    from platform_audit_log p left join users u on u.id = p.actor_user_id left join stores s on s.id = p.store_id
    order by p.created_at desc limit ${opts.limit ?? 100}`);
  return r.rows.map((x) => ({
    id: x.id,
    action: x.action,
    details: x.details,
    createdAt: new Date(x.created_at),
    actor: x.actor,
    slug: x.slug,
  }));
}
