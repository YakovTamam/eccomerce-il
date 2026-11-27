import { expect, test, type Browser } from "@playwright/test";

const APP = "http://app.localhost:3000";
const run = Math.random().toString(36).slice(2, 8);
// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function newOwner(browser: Browser, label: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/sign-up`);
  await page.getByLabel("שם מלא").fill(`Owner ${label}`);
  await page.getByLabel("אימייל").fill(`cat-${label}-${run}@example.com`);
  await page.getByLabel("סיסמה").fill("correct-horse-9");
  await page.getByRole("button", { name: "הרשמה" }).click();
  await expect(page.getByRole("heading", { name: /שלום Owner/ })).toBeVisible();
  await page.getByLabel("שם העסק").fill(`חנות ${label}`);
  await page.getByLabel("כתובת החנות").fill(`c${label}${run}`);
  await page.getByRole("button", { name: "יצירת חנות" }).click();
  await page.getByRole("link", { name: `חנות ${label}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "מוצרים" })).toBeVisible();
  return { ctx, page, base: page.url().replace(/\/products$/, "") };
}

test("create a product with 2 variants and an image; other stores cannot reach it", async ({
  browser,
}) => {
  const a = await newOwner(browser, "a");
  const { page } = a;

  // category
  await page.getByRole("link", { name: "קטגוריות" }).click();
  await page.getByLabel("שם קטגוריה חדשה").fill("מאפים");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByText("מאפים", { exact: true })).toBeVisible();

  // product
  await page.getByRole("link", { name: "מוצרים" }).click();
  await page.getByRole("link", { name: "מוצר חדש" }).click();
  await page.getByLabel("שם המוצר").fill("חלה לשבת");
  await page.getByLabel("סטטוס").selectOption("active");
  await page.getByLabel("קטגוריה").selectOption({ label: "מאפים" });

  await page
    .getByLabel("הוספת תמונה")
    .setInputFiles({ name: "challah.png", mimeType: "image/png", buffer: PNG });
  const alt = page.getByLabel("תיאור התמונה (alt) — חובה");
  await expect(alt).toBeVisible();

  // first variant
  const v1 = page.getByRole("group", { name: "וריאציה 1" });
  await v1.getByLabel("שם וריאציה").fill("קטנה");
  await v1.getByLabel(/^מחיר \(/).fill("20");
  await v1.getByLabel("מלאי", { exact: true }).fill("5");
  // second variant
  await page.getByRole("button", { name: "הוספת וריאציה" }).click();
  const v2 = page.getByRole("group", { name: "וריאציה 2" });
  await v2.getByLabel("שם וריאציה").fill("גדולה");
  await v2.getByLabel(/^מחיר \(/).fill("35.50");
  await v2.getByLabel("מלאי", { exact: true }).fill("3");

  // alt is required: server rejects an image without it
  await alt.fill("");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByLabel("תיאור התמונה (alt) — חובה")).toBeVisible(); // still on form (HTML required blocks submit)
  await alt.fill("חלה קלועה על שולחן שבת");
  await page.getByRole("button", { name: "שמירה" }).click();

  const row = page.getByRole("row", { name: /חלה לשבת/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("2"); // variants
  await expect(row).toContainText("₪20.00");
  await expect(row).toContainText("8"); // total stock
  await expect(row).toContainText("מאפים");

  // edit: stock persists, product loads back with both variants + image alt
  await row.getByRole("link", { name: "חלה לשבת" }).click();
  await expect(page.getByLabel("תיאור התמונה (alt) — חובה")).toHaveValue(
    "חלה קלועה על שולחן שבת",
  );
  await expect(
    page.getByRole("group", { name: "וריאציה 2" }).getByLabel(/^מחיר \(/),
  ).toHaveValue("35.50");

  // another owner cannot open store A's pages
  const b = await newOwner(browser, "b");
  await b.page.goto(`${a.base}/products`);
  await expect(b.page.getByText("This page could not be found")).toBeVisible();
  // Upload into store A's prefix as store B's owner (fetch runs in the browser, which resolves *.localhost).
  const status = await b.page.evaluate(
    async ({ storeId, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const fd = new FormData();
      fd.set("storeId", storeId);
      fd.set("file", new File([bytes], "x.png", { type: "image/png" }));
      return (await fetch("/api/uploads", { method: "POST", body: fd })).status;
    },
    { storeId: a.base.split("/stores/")[1], b64: PNG.toString("base64") },
  );
  expect(status).toBe(403);

  await a.ctx.close();
  await b.ctx.close();
});
