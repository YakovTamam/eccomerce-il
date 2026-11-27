import { expect, type Browser } from "@playwright/test";
import { Client } from "pg";

export const APP = "http://app.localhost:3000";
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export async function newOwner(browser: Browser, label: string, run: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/sign-up`);
  await page.getByLabel("שם מלא").fill(`Owner ${label}`);
  await page.getByLabel("אימייל").fill(`${label}-${run}@example.com`);
  await page.getByLabel("סיסמה").fill("correct-horse-9");
  await page.getByRole("button", { name: "הרשמה" }).click();
  await expect(page.getByRole("heading", { name: /שלום Owner/ })).toBeVisible();
  const slug = `${label}${run}`;
  await page.getByLabel("שם העסק").fill(`חנות ${label}`);
  await page.getByLabel("כתובת החנות").fill(slug);
  await page.getByRole("button", { name: "יצירת חנות" }).click();
  await page.getByRole("link", { name: `חנות ${label}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "מוצרים" })).toBeVisible();
  const storeId = page.url().match(/\/stores\/([0-9a-f-]{36})/)![1];
  return { ctx, page, slug, storeId, base: `${APP}/stores/${storeId}` };
}

/** Seed an active product straight into the DB (owner connection; bypasses RLS on purpose for fixtures). */
export async function seedProduct(
  storeId: string,
  title: string,
  slug: string,
  priceAgorot: number,
) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query(
      `insert into products (store_id, title, slug, status, images) values ($1,$2,$3,'active','[]') returning id`,
      [storeId, title, slug],
    );
    await c.query(
      `insert into product_variants (store_id, product_id, title, price_agorot, stock_qty) values ($1,$2,'רגיל',$3,5)`,
      [storeId, rows[0].id, priceAgorot],
    );
    return rows[0].id as string;
  } finally {
    await c.end();
  }
}
