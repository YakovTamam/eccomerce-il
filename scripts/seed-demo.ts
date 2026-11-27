/**
 * Fills a LOCAL/DEV database with demo data so the super-admin panel can be seen full.
 *   ALLOW_DEMO_SEED=1 pnpm seed:demo [admin-email]
 * Refuses to run in production. Idempotent-ish: skips if the demo stores already exist.
 */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { Client } from "pg";
import { encryptSecret } from "../lib/crypto/secrets";

if (
  process.env.NODE_ENV === "production" ||
  process.env.ALLOW_DEMO_SEED !== "1"
) {
  console.error(
    "Refusing to seed: set ALLOW_DEMO_SEED=1 (and never in production).",
  );
  process.exit(1);
}
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString("base64");

const adminEmail = process.argv[2];
const c = new Client({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
await c.connect();

// deterministic PRNG so the demo looks the same every time
let seed = 20261127;
const rnd = () =>
  (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const DAY = 86_400_000;

const STORES = [
  {
    name: "מאפיית הכפר",
    slug: "kfar-bakery",
    owner: "נועה לוי",
    plan: "growth",
    orders: 260,
    avg: 14500,
    age: 58,
  },
  {
    name: "בוטיק נועה",
    slug: "noa-boutique",
    owner: "נועה אבני",
    plan: "pro",
    orders: 140,
    avg: 32000,
    age: 51,
  },
  {
    name: "מעדני הים",
    slug: "sea-deli",
    owner: "יוסי כהן",
    plan: "pro",
    orders: 118,
    avg: 24000,
    age: 46,
  },
  {
    name: "קוסמטיקה גל",
    slug: "gal-cosmetics",
    owner: "גל ברק",
    plan: "pro",
    orders: 96,
    avg: 18500,
    age: 40,
  },
  {
    name: "פיצה ביס",
    slug: "pizza-bis",
    owner: "דורון מזרחי",
    plan: "basic",
    orders: 210,
    avg: 9800,
    age: 38,
  },
  {
    name: "חנות הצמחים",
    slug: "plant-shop",
    owner: "מיכל שרון",
    plan: "basic",
    orders: 64,
    avg: 12800,
    age: 33,
  },
  {
    name: "תכשיטי שני",
    slug: "shani-jewelry",
    owner: "שני דהן",
    plan: "growth",
    orders: 52,
    avg: 61000,
    age: 29,
  },
  {
    name: "ספרים וקפה",
    slug: "books-coffee",
    owner: "אורי פרידמן",
    plan: "basic",
    orders: 41,
    avg: 7600,
    age: 24,
  },
  {
    name: "נרות ריח",
    slug: "scent-candles",
    owner: "רונית אלון",
    plan: "basic",
    orders: 33,
    avg: 11200,
    age: 19,
  },
  {
    name: "חלבי הגליל",
    slug: "galil-dairy",
    owner: "אבי סגל",
    plan: "pro",
    orders: 27,
    avg: 15900,
    age: 14,
  },
  {
    name: "סטודיו לילדים",
    slug: "kids-studio",
    owner: "תמר גולן",
    plan: "basic",
    orders: 12,
    avg: 8900,
    age: 9,
  },
  {
    name: "קפה הצפון",
    slug: "north-coffee",
    owner: "עמית רוזן",
    plan: "basic",
    orders: 6,
    avg: 6400,
    age: 4,
  },
  {
    name: "אופנה בקטנה",
    slug: "small-fashion",
    owner: "ליאור בן דוד",
    plan: "basic",
    orders: 0,
    avg: 0,
    age: 2,
    suspended: true,
  },
] as const;

const exists = await c.query("select 1 from stores where slug = 'kfar-bakery'");
if (exists.rowCount) {
  console.log("Demo stores already exist — nothing to do.");
} else {
  const ids: Record<string, string> = {};
  for (const s of STORES) {
    const u = await c.query(
      "insert into users (email, name, email_verified) values ($1,$2,true) returning id",
      [`${s.slug}@demo.test`, s.owner],
    );
    const created = new Date(Date.now() - s.age * DAY);
    const st = await c.query(
      "insert into stores (slug, name, plan, status, created_at) values ($1,$2,$3,$4,$5) returning id",
      [
        s.slug,
        s.name,
        s.plan,
        "suspended" in s ? "suspended" : "active",
        created,
      ],
    );
    ids[s.slug] = st.rows[0].id;
    await c.query(
      "insert into store_members (store_id, user_id, role) values ($1,$2,'owner')",
      [st.rows[0].id, u.rows[0].id],
    );
    for (let n = 1; n <= s.orders; n++) {
      // more recent days get slightly more orders, with a weekly rhythm (Friday peak)
      const daysAgo = Math.min(
        Math.floor(Math.pow(rnd(), 1.25) * Math.min(s.age, 40)),
        39,
      );
      const when = new Date(
        Date.now() - daysAgo * DAY - Math.floor(rnd() * DAY),
      );
      const total = Math.max(1500, Math.round(s.avg * (0.4 + rnd() * 1.4)));
      const status =
        rnd() < 0.06
          ? "pending_payment"
          : pick([
              "paid",
              "completed",
              "completed",
              "completed",
              "preparing",
              "shipped",
            ]);
      await c.query(
        `insert into orders (store_id, number, status, subtotal_agorot, total_agorot, vat_rate_bp, shipping_method, paid_at, created_at)
         values ($1,$2,$3,$4,$4,1800,$5,$6,$7)`,
        [
          st.rows[0].id,
          n,
          status,
          total,
          rnd() < 0.5 ? "pickup" : "delivery",
          status === "pending_payment" ? null : when,
          when,
        ],
      );
    }
    const p = await c.query(
      "insert into products (store_id, title, slug, status) values ($1,$2,$3,'active') returning id",
      [st.rows[0].id, `${s.name} — מוצר ראשון`, "first"],
    );
    await c.query(
      "insert into product_variants (store_id, product_id, title, price_agorot, stock_qty) values ($1,$2,'רגיל',$3,10)",
      [st.rows[0].id, p.rows[0].id, s.avg || 5000],
    );
  }

  // domains: one verified+primary, two waiting for verification
  await c.query(
    "insert into store_domains (store_id, hostname, is_primary, verified_at) values ($1,'www.kfar-bakery.co.il',true,now())",
    [ids["kfar-bakery"]],
  );
  await c.query(
    "insert into store_domains (store_id, hostname) values ($1,'shop.noa-boutique.com')",
    [ids["noa-boutique"]],
  );
  await c.query(
    "insert into store_domains (store_id, hostname) values ($1,'order.pizzabis.co.il')",
    [ids["pizza-bis"]],
  );

  // WhatsApp: one active, two pending
  for (const [slug, status, pid] of [
    ["kfar-bakery", "active", "104827163549201"],
    ["pizza-bis", "pending", "109334455667788"],
    ["sea-deli", "pending", "108112233445566"],
  ] as const) {
    await c.query(
      "insert into whatsapp_accounts (store_id, phone_number_id, waba_id, display_phone, access_token_encrypted, status) values ($1,$2,$3,$4,$5,$6)",
      [
        ids[slug],
        pid,
        `2${pid.slice(1)}`,
        "+972501234567",
        encryptSecret("demo-token"),
        status,
      ],
    );
  }

  // things that need attention: failed outbox jobs and failed payments
  for (const [slug, type, err] of [
    ["gal-cosmetics", "create_invoice", "Morning API: 503 Service Unavailable"],
    ["pizza-bis", "send_order_email", "Resend HTTP 422: invalid `to` address"],
  ] as const) {
    await c.query(
      "insert into outbox_jobs (store_id, type, payload, dedupe_key, status, attempts, last_error) values ($1,$2,'{}',$3,'failed',5,$4)",
      [ids[slug], type, `demo-${slug}-${type}`, err],
    );
  }
  for (const [slug, mismatch] of [
    ["pizza-bis", true],
    ["noa-boutique", false],
  ] as const) {
    const o = await c.query(
      "select id from orders where store_id = $1 order by number desc limit 1",
      [ids[slug]],
    );
    await c.query(
      "insert into payments (store_id, order_id, provider, provider_ref, status, amount_agorot, raw) values ($1,$2,'cardcom',$3,'failed',9800,$4)",
      [
        ids[slug],
        o.rows[0].id,
        `demo-${slug}`,
        mismatch ? { mismatch: { expected: 9800, got: 1000 } } : {},
      ],
    );
  }

  // Claude connections
  const clientId = `mcpc_demo_${randomBytes(4).toString("hex")}`;
  await c.query(
    "insert into oauth_clients (client_id, name, redirect_uris) values ($1,'Claude','[\"https://claude.ai/api/mcp/auth_callback\"]')",
    [clientId],
  );
  for (const slug of ["kfar-bakery", "noa-boutique", "gal-cosmetics"]) {
    const owner = await c.query(
      "select user_id from store_members where store_id = $1",
      [ids[slug]],
    );
    const h = () => createHash("sha256").update(randomBytes(16)).digest("hex");
    await c.query(
      `insert into oauth_grants (client_id, user_id, store_id, scopes, access_token_hash, access_expires_at, refresh_token_hash, refresh_expires_at, last_used_at)
       values ($1,$2,$3,'["read","write"]',$4, now()+interval '1 hour', $5, now()+interval '30 days', now() - interval '3 hours')`,
      [clientId, owner.rows[0].user_id, ids[slug], h(), h()],
    );
  }

  // admin activity (needs the admin's user id)
  if (adminEmail) {
    const a = await c.query(
      "select id from users where lower(email) = lower($1)",
      [adminEmail],
    );
    if (a.rowCount) {
      const rows: [string, string, object][] = [
        ["store.plan_change", "kfar-bakery", { from: "pro", to: "growth" }],
        ["domain.verify", "kfar-bakery", { hostname: "www.kfar-bakery.co.il" }],
        [
          "whatsapp.connect",
          "kfar-bakery",
          {
            phoneNumberId: "104827163549201",
            status: "active",
            tokenChanged: true,
          },
        ],
        [
          "store.suspend",
          "small-fashion",
          {
            from: "active",
            to: "suspended",
            reason: "חשד לשימוש בכרטיס אשראי גנוב",
          },
        ],
        ["job.retry", "gal-cosmetics", { type: "create_invoice" }],
      ];
      let i = 0;
      for (const [action, slug, details] of rows) {
        await c.query(
          "insert into platform_audit_log (actor_user_id, action, store_id, details, created_at) values ($1,$2,$3,$4, now() - ($5 || ' hours')::interval)",
          [a.rows[0].id, action, ids[slug], details, String(2 + i++ * 7)],
        );
      }
    }
  }
  console.log(
    `Seeded ${STORES.length} demo stores with orders, domains, WhatsApp accounts, failed jobs/payments and MCP connections.`,
  );
}
await c.end();
