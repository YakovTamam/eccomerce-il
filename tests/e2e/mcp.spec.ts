/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic JSON returned by MCP tools */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { Client as Pg } from "pg";
import { APP, newOwner, seedProduct } from "./helpers";

const run = Math.random().toString(36).slice(2, 8);
const BASE = "http://localhost:3000"; // /api and /.well-known pass through on any host
const CB = "http://localhost:6274/oauth/callback";
const RESOURCE = `${APP}/api/mcp`;

async function sql<T = Record<string, unknown>>(
  q: string,
  args: unknown[] = [],
) {
  const c = new Pg({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(q, args)).rows as T[];
  } finally {
    await c.end();
  }
}

async function register() {
  const r = await fetch(`${BASE}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude (test)", redirect_uris: [CB] }),
  });
  expect(r.status).toBe(201);
  return (await r.json()).client_id as string;
}

/** Real authorization-code + PKCE flow, driving the consent screen in the owner's logged-in browser. */
async function authorize(
  page: Page,
  clientId: string,
  opts: { write: boolean },
) {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(8).toString("hex");
  await page.route("http://localhost:6274/**", (r) =>
    r.fulfill({ status: 200, body: "callback" }),
  );
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CB,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "read write",
    state,
    resource: RESOURCE,
  });
  await page.goto(`${APP}/oauth/authorize?${q}`);
  await expect(page.getByRole("heading", { name: /לאשר ל/ })).toBeVisible();
  if (!opts.write) await page.getByLabel(/^כתיבה/).uncheck();
  await page.getByRole("button", { name: "אישור וחיבור" }).click();
  await page.waitForURL(/localhost:6274/);
  const cb = new URL(page.url());
  expect(cb.searchParams.get("state")).toBe(state);
  expect(cb.searchParams.get("iss")).toBe(new URL(APP).origin);
  const code = cb.searchParams.get("code")!;

  const t = await fetch(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: CB,
      code_verifier: verifier,
      resource: RESOURCE,
    }),
  });
  expect(t.status).toBe(200);
  return (await t.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };
}

async function connect(token: string) {
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const call = async (
  c: Client,
  name: string,
  args: Record<string, unknown> = {},
) => {
  const r = (await c.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const text = r.content[0].text;
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { isError: !!r.isError, text, json: json as Record<string, any> };
};

async function seedOrder(storeId: string) {
  const [c] = await sql<{ id: string }>(
    "insert into customers (store_id, name, phone_e164) values ($1,'דנה','+972501234567') returning id",
    [storeId],
  );
  const [o] = await sql<{ id: string }>(
    `insert into orders (store_id, number, customer_id, status, subtotal_agorot, total_agorot, vat_rate_bp, shipping_method, paid_at)
     values ($1, 1, $2, 'paid', 5000, 5000, 1800, 'pickup', now()) returning id`,
    [storeId, c.id],
  );
  await sql(
    "insert into order_items (store_id, order_id, title_snapshot, unit_price_agorot, qty) values ($1,$2,'חלה',2500,2)",
    [storeId, o.id],
  );
  return o.id;
}

test("OAuth 2.1 + MCP: connect, read, draft → approve → live, token isolation, revocation", async ({
  browser,
}) => {
  const A = await newOwner(browser, "ma", run);
  const B = await newOwner(browser, "mb", run);
  const pA = await seedProduct(A.storeId, "חלה לשבת", "challah", 2000);
  const pB = await seedProduct(B.storeId, "מוצר של B", "b-prod", 1000);
  const orderId = await seedOrder(A.storeId);

  // ── discovery documents
  const prm = await (
    await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)
  ).json();
  expect(prm).toMatchObject({
    resource: RESOURCE,
    authorization_servers: [new URL(APP).origin],
  });
  const asm = await (
    await fetch(`${BASE}/.well-known/oauth-authorization-server`)
  ).json();
  expect(asm).toMatchObject({
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
  expect(asm.registration_endpoint).toContain("/api/oauth/register");

  // ── unauthenticated access is refused with a pointer to the metadata
  const noAuth = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: "{}",
  });
  expect(noAuth.status).toBe(401);
  expect(noAuth.headers.get("www-authenticate")).toContain(
    "resource_metadata=",
  );
  const badAuth = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: "Bearer mcp_at_nope",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(badAuth.status).toBe(401);
  // registration refuses unsafe redirect URIs
  const evil = await fetch(`${BASE}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["http://evil.com/cb"] }),
  });
  expect(evil.status).toBe(400);
  // a forged/unknown redirect_uri on /authorize never redirects
  const clientId = await register();
  await A.page.goto(
    `${APP}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent("https://evil.com/cb")}&code_challenge=${"a".repeat(43)}&code_challenge_method=S256`,
  );
  await expect(A.page.getByText("כתובת החזרה אינה תואמת")).toBeVisible();

  // ── sign-in redirect keeps the authorization request (?next=)
  const fresh = await browser.newContext();
  const fp = await fresh.newPage();
  await fp.goto(
    `${APP}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(CB)}&code_challenge=${"a".repeat(43)}&code_challenge_method=S256&scope=read&state=s1`,
  );
  await expect(fp).toHaveURL(/\/sign-in\?next=/);
  await fp.getByLabel("אימייל").fill(`ma-${run}@example.com`);
  await fp.getByLabel("סיסמה").fill("correct-horse-9");
  await fp.getByRole("button", { name: "כניסה" }).click();
  await expect(fp.getByRole("heading", { name: /לאשר ל/ })).toBeVisible();
  await fresh.close();

  // ── full flow → token for store A (read+write)
  const tok = await authorize(A.page, clientId, { write: true });
  expect(tok.scope).toBe("read write");
  const mcp = await connect(tok.access_token);

  const tools = (await mcp.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(
    expect.arrayContaining([
      "get_store_overview",
      "list_products",
      "create_page",
      "approve_draft",
      "update_product",
      "create_campaign",
      "update_order_status",
    ]),
  );
  // store_id is never a tool parameter
  for (const t of (await mcp.listTools()).tools)
    expect(JSON.stringify(t.inputSchema)).not.toMatch(/store_?id/i);

  // ── reads
  const ov = await call(mcp, "get_store_overview");
  expect(ov.json.sales.today.revenue_agorot).toBe(5000);
  expect(ov.json.open_orders).toBe(1);
  const lp = await call(mcp, "list_products");
  expect(lp.json.map((p: any) => p.title)).toEqual(["חלה לשבת"]); // never B's product
  expect((await call(mcp, "get_order", { number: 1 })).json.customer.name).toBe(
    "דנה",
  );
  const rep = await call(mcp, "get_sales_report", {
    from: day(-5),
    to: day(2),
    group_by: "product",
  });
  expect(rep.json.rows[0]).toMatchObject({
    product: "חלה",
    units: 2,
    revenue_agorot: 5000,
  });
  expect(
    (
      await call(mcp, "get_sales_report", {
        from: "2020-01-01",
        to: "2099-12-31",
      })
    ).isError,
  ).toBe(true); // > 366 days
  expect((await call(mcp, "get_block_schemas")).json.labels.hero).toBeTruthy();

  // ── token isolation: A's token cannot see or touch B's data
  expect((await call(mcp, "get_product", { product_id: pB })).isError).toBe(
    true,
  );
  expect(
    (await call(mcp, "update_product", { product_id: pB, title: "פריצה" }))
      .isError,
  ).toBe(true);
  expect(
    (
      await call(mcp, "create_page", {
        slug: "x",
        title: "x",
        blocks: [{ id: "f", type: "featured_product", productId: pB }],
      })
    ).isError,
  ).toBe(true);

  // ── create_page → DRAFT (not live) → approve → published
  const storefront = await browser.newPage();
  const SHOP = `http://${A.slug}.localhost:3000`;
  const cp = await call(mcp, "create_page", {
    slug: "home",
    title: "דף הבית",
    blocks: [
      {
        id: "h",
        type: "hero",
        heading: "ברוכים הבאים למאפייה",
        subheading: "טרי כל בוקר",
      },
      { id: "g", type: "product_grid", source: { by: "all" } },
    ],
  });
  expect(cp.isError).toBe(false);
  expect(cp.json).toMatchObject({ kind: "page", status: "pending" });
  expect(cp.json.preview_url).toContain("/preview/draft/");
  await storefront.goto(SHOP);
  await expect(
    storefront.getByRole("heading", { name: "ברוכים הבאים למאפייה" }),
  ).toHaveCount(0); // not live

  // the signed preview link works (and a tampered one doesn't)
  await storefront.goto(cp.json.preview_url);
  await expect(
    storefront.getByRole("heading", { name: "ברוכים הבאים למאפייה" }),
  ).toBeVisible();
  await storefront.goto(`${cp.json.preview_url}x`);
  await expect(
    storefront.getByText("This page could not be found"),
  ).toBeVisible();

  const ap = await call(mcp, "approve_draft", { draft_id: cp.json.draft_id });
  expect(ap.json.status).toBe("approved");
  await expect(async () => {
    await storefront.goto(SHOP);
    await expect(
      storefront.getByRole("heading", { name: "ברוכים הבאים למאפייה" }),
    ).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  expect(
    (await call(mcp, "approve_draft", { draft_id: cp.json.draft_id })).isError,
  ).toBe(true); // already approved

  // ── price change is a draft; DB unchanged until approval
  const ud = await call(mcp, "update_product", {
    product_id: pA,
    variants: [
      {
        id: (await call(mcp, "get_product", { product_id: pA })).json
          .variants[0].id,
        price_agorot: 2500,
        stock_qty: 9,
      },
    ],
  });
  expect(ud.json.summary).toEqual(
    expect.arrayContaining([expect.stringContaining("₪20.00 ← ₪25.00")]),
  );
  expect(
    (
      await sql<{ price_agorot: number }>(
        "select price_agorot from product_variants where product_id=$1",
        [pA],
      )
    )[0].price_agorot,
  ).toBe(2000);
  await call(mcp, "approve_draft", { draft_id: ud.json.draft_id });
  expect(
    (
      await sql<{ price_agorot: number; stock_qty: number }>(
        "select price_agorot, stock_qty from product_variants where product_id=$1",
        [pA],
      )
    )[0],
  ).toEqual({ price_agorot: 2500, stock_qty: 9 });

  // ── campaign (page + coupon) approved together
  const camp = await call(mcp, "create_campaign", {
    name: "חנוכה",
    page: {
      slug: "hanuka",
      title: "חנוכה",
      blocks: [{ id: "b", type: "banner", text: "20% הנחה" }],
    },
    discount: { code: "hanuka20", type: "percent", value: 20 },
  });
  expect(camp.json.children).toHaveLength(2);
  expect(
    (
      await sql(
        "select 1 from discounts where store_id=$1 and code='HANUKA20'",
        [A.storeId],
      )
    ).length,
  ).toBe(0);
  await call(mcp, "approve_draft", { draft_id: camp.json.draft_id });
  expect(
    (
      await sql(
        "select 1 from discounts where store_id=$1 and code='HANUKA20'",
        [A.storeId],
      )
    ).length,
  ).toBe(1);

  // ── a coupon draft approved by the human in the dashboard instead
  const cd = await call(mcp, "create_discount", {
    code: "dash10",
    type: "fixed",
    value: 1000,
  });
  await A.page.goto(`${A.base}/drafts`);
  await A.page.getByRole("link", { name: "קופון DASH10" }).click();
  await expect(A.page.getByText("קופון חדש DASH10")).toBeVisible();
  await A.page.getByRole("button", { name: "אישור והפעלה" }).click();
  await expect(A.page.getByText("אושרה והופעלה")).toBeVisible();
  expect(
    (
      await sql("select 1 from discounts where store_id=$1 and code='DASH10'", [
        A.storeId,
      ])
    ).length,
  ).toBe(1);
  expect(cd.json.review_in_dashboard).toContain(`/stores/${A.storeId}/drafts/`);

  // ── create_product (draft status) and operational order status (no paid/refunded)
  const np = await call(mcp, "create_product", {
    title: "לחמניה חדשה",
    variants: [{ title: "רגיל", price_agorot: 800, stock_qty: 20 }],
  });
  expect(
    (
      await sql<{ status: string }>("select status from products where id=$1", [
        np.json.product_id,
      ])
    )[0].status,
  ).toBe("draft");
  expect(
    (
      await call(mcp, "update_order_status", {
        order_id: orderId,
        status: "preparing",
      })
    ).json.to,
  ).toBe("preparing");
  expect(
    (
      await call(mcp, "update_order_status", {
        order_id: orderId,
        status: "paid",
      })
    ).isError,
  ).toBe(true); // not a valid input at all

  // ── everything the AI did is in the audit log, scoped to this store
  const actions = (
    await sql<{ action: string; actor_type: string }>(
      "select action, actor_type from audit_log where store_id=$1",
      [A.storeId],
    )
  ).map((r) => r.action);
  expect(actions).toEqual(
    expect.arrayContaining([
      "draft.create",
      "page.create_published",
      "product.update",
      "discount.create",
      "product.create",
      "order.status_change",
      "draft.approve",
    ]),
  );
  expect(
    (
      await sql(
        "select 1 from audit_log where store_id=$1 and actor_type='mcp'",
        [B.storeId],
      )
    ).length,
  ).toBe(0);
  await A.page.goto(`${A.base}/audit`);
  await expect(
    A.page.getByRole("cell", { name: "page.create_published" }).first(),
  ).toBeVisible();

  // ── connections list + revocation (dashboard) kills the token immediately
  await A.page.goto(`${A.base}/claude`);
  await expect(
    A.page.getByRole("cell", { name: "Claude (test)" }).first(),
  ).toBeVisible();
  await expect(A.page.getByText(`${RESOURCE}`)).toBeVisible();

  // refresh-token rotation
  const rt = await fetch(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tok.refresh_token,
      client_id: clientId,
    }),
  });
  expect(rt.status).toBe(200);
  const t2 = await rt.json();
  const replay = await fetch(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tok.refresh_token,
      client_id: clientId,
    }),
  });
  expect(replay.status).toBe(400); // reuse → whole grant revoked
  await mcp.close();
  const dead = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${t2.access_token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(dead.status).toBe(401);

  await storefront.close();
  await A.ctx.close();
  await B.ctx.close();
});

test("a read-only connection cannot write; revoking via the endpoint stops access", async ({
  browser,
}) => {
  const A = await newOwner(browser, "mr", run);
  await seedProduct(A.storeId, "חלה", "c2", 2000);
  const clientId = await register();
  const tok = await authorize(A.page, clientId, { write: false });
  expect(tok.scope).toBe("read");
  const mcp = await connect(tok.access_token);
  expect((await call(mcp, "list_products")).isError).toBe(false);
  const w = await call(mcp, "create_discount", {
    code: "nope1",
    type: "percent",
    value: 10,
  });
  expect(w.isError).toBe(true);
  expect(w.text).toContain("write");
  expect(
    (await sql("select 1 from drafts where store_id=$1", [A.storeId])).length,
  ).toBe(0);

  const rv = await fetch(`${BASE}/api/oauth/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tok.access_token }),
  });
  expect(rv.status).toBe(200);
  await mcp.close();
  const dead = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tok.access_token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(dead.status).toBe(401);
  await A.ctx.close();
});
