import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { newOwner, seedProduct } from "./helpers";

const run = Math.random().toString(36).slice(2, 8);
const SECRET = process.env.AUTH_SECRET ?? "x";
const sign = (body: string) =>
  createHmac("sha256", SECRET).update(body).digest("hex");

async function sql<T = Record<string, unknown>>(
  q: string,
  args: unknown[] = [],
) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(q, args)).rows as T[];
  } finally {
    await c.end();
  }
}

test("product → cart → coupon → mock payment → paid order, stock down, invoice; duplicate webhook is harmless", async ({
  browser,
}) => {
  const o = await newOwner(browser, "k", run);
  const { page } = o;
  const productId = await seedProduct(o.storeId, "חלה לשבת", "challah", 2000); // ₪20.00, stock 5

  // ── merchant creates a coupon in the dashboard
  await page.goto(`${o.base}/discounts`);
  await page.getByLabel("קוד", { exact: true }).fill("save10");
  await page.getByLabel(/^ערך/).fill("10");
  await page.getByRole("button", { name: "יצירת קופון" }).click();
  await expect(page.getByRole("cell", { name: "SAVE10" })).toBeVisible();

  // ── customer journey on the store host (mobile)
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  const shop = await ctx.newPage();
  const SHOP = `http://${o.slug}.localhost:3000`;
  await shop.goto(`${SHOP}/products/challah`);
  await shop.getByLabel("כמות").fill("2");
  await shop.getByRole("button", { name: "הוספה לעגלה" }).click();
  await expect(shop.getByRole("heading", { name: "עגלת קניות" })).toBeVisible();
  await expect(shop.getByText("₪40.00").first()).toBeVisible();

  // a forged price/field cannot change what is charged: prices are never read from the client
  await shop.getByLabel("קוד קופון").fill("nope");
  await shop.getByRole("button", { name: "החלה" }).click();
  await expect(shop.getByText("קוד הקופון לא קיים")).toBeVisible();
  await shop.getByLabel("קוד קופון").fill("save10");
  await shop.getByRole("button", { name: "החלה" }).click();
  await expect(shop.getByText("הוחל")).toBeVisible();
  await expect(shop.getByText("סה״כ לתשלום").locator("..")).toContainText(
    "₪36.00",
  );

  await expect(shop).toHaveTitle(/עגלת קניות/); // soft navigation: metadata streams in after the content
  const axeCart = await new AxeBuilder({ page: shop })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axeCart.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => v.id),
  ).toEqual([]);

  await shop.getByRole("link", { name: "המשך לתשלום" }).click();
  await expect(
    shop.getByRole("heading", { name: "פרטים ותשלום" }),
  ).toBeVisible();
  await shop.getByLabel("שם מלא").fill("דנה כהן");
  await shop.getByLabel("טלפון נייד").fill("050-123-4567");
  await shop.getByLabel(/^אימייל/).fill("dana@example.com");
  await expect(shop).toHaveTitle(/תשלום/);
  const axeCo = await new AxeBuilder({ page: shop })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axeCo.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => v.id),
  ).toEqual([]);
  await shop.getByRole("button", { name: "לתשלום" }).click();

  // ── provider-hosted (mock) page: no card fields exist on our side
  await expect(
    shop.getByRole("heading", { name: /דף תשלום מאובטח/ }),
  ).toBeVisible();
  await expect(shop.getByText("₪36.00")).toBeVisible();
  expect(new URL(shop.url()).pathname).toBe("/api/mock-pay");
  await shop.getByRole("button", { name: "שלם עכשיו" }).click();

  await expect(
    shop.getByRole("heading", { name: "תודה! ההזמנה התקבלה" }),
  ).toBeVisible();
  await expect(shop.getByRole("status")).toContainText("#1");

  // ── DB truth: paid, stock 5 → 3, coupon used, one payment
  const [order] = await sql<{
    id: string;
    status: string;
    total_agorot: number;
    discount_agorot: number;
  }>(
    "select id, status, total_agorot, discount_agorot from orders where store_id=$1",
    [o.storeId],
  );
  expect(order).toMatchObject({
    status: "paid",
    total_agorot: 3600,
    discount_agorot: 400,
  });
  expect(
    (
      await sql<{ stock_qty: number }>(
        "select stock_qty from product_variants where product_id=$1",
        [productId],
      )
    )[0].stock_qty,
  ).toBe(3);
  expect(
    (
      await sql<{ used_count: number }>(
        "select used_count from discounts where store_id=$1",
        [o.storeId],
      )
    )[0].used_count,
  ).toBe(1);
  const [pay] = await sql<{ provider_ref: string; provider: string }>(
    "select provider, provider_ref from payments where order_id=$1",
    [order.id],
  );

  // ── invoice via the outbox (cron endpoint is the safety net; auth required)
  const cron = (auth?: string) =>
    fetch("http://localhost:3000/api/cron/outbox", {
      headers: auth ? { authorization: auth } : {},
    });
  expect((await cron()).status).toBe(401);
  expect((await cron("Bearer wrong")).status).toBe(401);
  await expect
    .poll(async () => {
      await cron(`Bearer ${process.env.CRON_SECRET}`);
      return (await sql("select 1 from invoices where order_id=$1", [order.id]))
        .length;
    })
    .toBe(1);

  // ── duplicate / forged webhooks
  const body = JSON.stringify({
    providerRef: pay.provider_ref,
    orderId: `${o.storeId}:${order.id}`,
    amountAgorot: 3600,
    status: "paid",
  });
  const hook = (b: string, sig: string) =>
    fetch("http://localhost:3000/api/webhooks/payments/mock", {
      method: "POST",
      body: b,
      headers: { "x-mock-signature": sig, "content-type": "application/json" },
    });
  for (let i = 0; i < 3; i++) {
    const r = await hook(body, sign(body));
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("duplicate");
  }
  expect((await hook(body, "deadbeef")).status).toBe(400); // forged signature
  expect(
    (
      await fetch("http://localhost:3000/api/webhooks/payments/cardcom", {
        method: "POST",
        body,
      })
    ).status,
  ).toBe(404); // wrong provider
  expect(
    (
      await sql<{ stock_qty: number }>(
        "select stock_qty from product_variants where product_id=$1",
        [productId],
      )
    )[0].stock_qty,
  ).toBe(3);
  expect(
    (await sql("select 1 from payments where order_id=$1", [order.id])).length,
  ).toBe(1);
  await cron(`Bearer ${process.env.CRON_SECRET}`);
  expect(
    (await sql("select 1 from invoices where order_id=$1", [order.id])).length,
  ).toBe(1);

  // tampered mock-pay link is rejected
  const bad = await shop.request.get(
    `${SHOP.replace(`${o.slug}.localhost`, "localhost")}/api/mock-pay?ref=x&order=y&amount=1&success=http://evil&cancel=http://evil&sig=00`,
  );
  expect(bad.status()).toBe(400);

  // ── dashboard shows the order, the invoice and offers a refund that restocks
  await page.goto(`${o.base}/orders`);
  await page.getByRole("link", { name: "#1" }).click();
  await expect(page.getByRole("heading", { name: /הזמנה #1/ })).toContainText(
    "שולמה",
  );
  await expect(page.getByText("MOCK-1")).toBeVisible();
  await expect(page.getByText("₪36.00").first()).toBeVisible();
  await page.getByLabel("שינוי סטטוס").selectOption({ label: "בהכנה" });
  await page.getByRole("button", { name: "עדכון" }).click();
  await expect(page.getByText("הסטטוס עודכן")).toBeVisible();
  await page.getByRole("button", { name: "החזר כספי מלא" }).click();
  await expect(page.getByText("ההחזר בוצע")).toBeVisible();
  expect(
    (
      await sql<{ status: string }>("select status from orders where id=$1", [
        order.id,
      ])
    )[0].status,
  ).toBe("refunded");
  expect(
    (
      await sql<{ stock_qty: number }>(
        "select stock_qty from product_variants where product_id=$1",
        [productId],
      )
    )[0].stock_qty,
  ).toBe(5);

  await ctx.close();
  await o.ctx.close();
});
