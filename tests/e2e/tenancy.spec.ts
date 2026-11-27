import { expect, test, type Browser } from "@playwright/test";

const APP = "http://app.localhost:3000";
const run = Math.random().toString(36).slice(2, 8);

async function signUpAndCreateStore(browser: Browser, label: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/sign-up`);
  await page.getByLabel("שם מלא").fill(`Owner ${label}`);
  await page.getByLabel("אימייל").fill(`${label}-${run}@example.com`);
  await page.getByLabel("סיסמה").fill("correct-horse-9");
  await page.getByRole("button", { name: "הרשמה" }).click();
  await expect(page.getByRole("heading", { name: /שלום Owner/ })).toBeVisible();
  await page.getByLabel("שם העסק").fill(`חנות ${label}`);
  await page.getByLabel("כתובת החנות").fill(`${label}${run}`);
  await page.getByRole("button", { name: "יצירת חנות" }).click();
  await expect(page.getByRole("link", { name: `חנות ${label}` })).toBeVisible();
  return ctx;
}

test("a.localhost and b.localhost show different stores", async ({
  browser,
  page,
}) => {
  await (await signUpAndCreateStore(browser, "a")).close();
  await (await signUpAndCreateStore(browser, "b")).close();

  await page.goto(`http://a${run}.localhost:3000/`);
  await expect(page.getByRole("heading", { name: "חנות a" })).toBeVisible();
  await page.goto(`http://b${run}.localhost:3000/`);
  await expect(page.getByRole("heading", { name: "חנות b" })).toBeVisible();
  // NOTE: status is 200 for now (notFound() fires after streaming started); proper 404 status is a Phase 3 item.
  await page.goto(`http://nope${run}.localhost:3000/`);
  await expect(page.getByText("This page could not be found")).toBeVisible();
});

test("internal route trees are not reachable directly", async ({ page }) => {
  const res = await page.request.get("http://localhost:3000/_dashboard");
  expect(res.status()).toBe(404);
});

test("dashboard requires sign-in", async ({ page }) => {
  await page.goto(APP);
  await expect(page).toHaveURL(/\/sign-in$/);
});
