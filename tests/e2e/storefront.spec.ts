import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { newOwner, PNG, seedProduct } from "./helpers";

const run = Math.random().toString(36).slice(2, 8);

async function addBlock(page: Page, label: string) {
  await page.getByLabel("סוג בלוק").selectOption({ label });
  await page.getByRole("button", { name: "הוספת בלוק" }).click();
}

/** Reload the storefront until `check` passes: dashboard actions finish asynchronously. */
async function eventually(page: Page, url: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(url);
    await check();
  }).toPass({ timeout: 20_000 });
}
const block = (page: Page, label: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.locator("summary", { hasText: label }) });

test("build a home page with blocks, publish, roll back; storefront is RTL, mobile-safe and axe-clean", async ({
  browser,
}) => {
  const o = await newOwner(browser, "s", run);
  const { page } = o;
  await seedProduct(o.storeId, "חלה לשבת", "challah", 2000);

  // ── create home page
  await page.goto(`${o.base}/pages`);
  await page.getByRole("button", { name: "יצירת עמוד" }).click();
  await expect(page.getByRole("heading", { name: /דף הבית/ })).toBeVisible();

  // ── add 7 blocks of different types
  await addBlock(page, "כותרת ראשית (Hero)");
  const hero = block(page, "כותרת ראשית");
  await hero.getByLabel("כותרת", { exact: true }).fill("מאפיית הכפר");
  await hero.getByLabel("תת-כותרת").fill("לחם טרי כל בוקר");
  await hero
    .getByLabel("תמונת רקע (אופציונלי)")
    .setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: PNG });
  await hero.getByLabel("תיאור התמונה (alt) — חובה").fill("מאפה טרי על השולחן");
  await hero.getByLabel("טקסט הכפתור").fill("לכל המוצרים");
  await hero.getByLabel(/^קישור/).fill("/category/all");

  await addBlock(page, "באנר / מבצע");
  const banner = block(page, "באנר");
  await banner.getByLabel("טקסט המבצע").fill("20% הנחה על כל החלות");
  await banner.getByLabel(/^סיום המבצע/).fill("2030-01-01T10:00");

  await addBlock(page, "טקסט");
  await block(page, "טקסט")
    .first()
    .getByLabel(/^טקסט \(Markdown/)
    .fill(
      "## אודותינו\n\nאנחנו **מאפייה משפחתית** מאז 1990.\n\n- חלות\n- לחמים",
    );

  await addBlock(page, "רשת מוצרים");
  await addBlock(page, "שאלות נפוצות");
  const faq = block(page, "שאלות נפוצות");
  await faq.getByLabel("שאלה", { exact: true }).fill("יש משלוחים?");
  await faq.getByLabel("תשובה").fill("כן, בכל הארץ.");

  await addBlock(page, "המלצות");
  const t = block(page, "המלצות");
  await t.getByLabel("ציטוט").fill("החלה הכי טובה בעיר");
  await t.getByLabel("שם", { exact: true }).fill("דנה");

  await addBlock(page, "כפתור וואטסאפ");
  await block(page, "כפתור וואטסאפ")
    .getByLabel(/^מספר וואטסאפ/)
    .fill("+972501234567");

  // XSS attempt in markdown must not become HTML
  await block(page, "טקסט")
    .first()
    .getByLabel(/^טקסט \(Markdown/)
    .fill(
      "## אודותינו\n\nאנחנו **מאפייה משפחתית** <img src=x onerror=alert(1)> [x](javascript:alert(1))\n\n- חלות\n- לחמים",
    );

  await page.getByRole("button", { name: "שמירה ופרסום" }).click();
  await expect(page.getByText("העמוד פורסם")).toBeVisible();

  // ── storefront (a different host → rewritten to the store tree)
  const sctx = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  const store = await sctx.newPage();
  await store.goto(`http://${o.slug}.localhost:3000/`);
  await expect(store.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    store.getByRole("heading", { name: "מאפיית הכפר" }),
  ).toBeVisible();
  await expect(store.getByText("20% הנחה על כל החלות")).toBeVisible();
  await expect(store.getByRole("link", { name: /חלה לשבת/ })).toBeVisible();
  await expect(store.getByText("₪20.00")).toBeVisible();
  await expect(store.getByText("החלה הכי טובה בעיר")).toBeVisible();
  await expect(
    store.getByRole("link", { name: "להזמנה בוואטסאפ" }),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/972501234567/);
  expect(
    await store
      .locator("script:not([src]):not([type])", { hasText: "alert(1)" })
      .count(),
  ).toBe(0);
  expect(await store.locator("img[onerror]").count()).toBe(0);
  expect(await store.locator('a[href^="javascript:"]').count()).toBe(0);
  // hero image served from /uploads through the store host
  await expect
    .poll(() =>
      store
        .locator("img[alt='מאפה טרי על השולחן']")
        .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0),
    )
    .toBe(true);
  // no horizontal scroll on mobile
  expect(
    await store.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const axe = await new AxeBuilder({ page: store })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = axe.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual(
    [],
  );

  // product page + SEO endpoints
  await store.goto(`http://${o.slug}.localhost:3000/products/challah`);
  await expect(
    store.getByRole("heading", { level: 1, name: "חלה לשבת" }),
  ).toBeVisible();
  const axe2 = await new AxeBuilder({ page: store })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axe2.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => v.id),
  ).toEqual([]);
  expect(
    await store.locator('meta[property="og:title"]').getAttribute("content"),
  ).toContain("חלה לשבת");
  await store.goto(`http://${o.slug}.localhost:3000/sitemap.xml`);
  const sitemap = await store.content();
  expect(sitemap).toContain("/products/challah");
  await store.goto(`http://${o.slug}.localhost:3000/robots.txt`);
  expect(await store.content()).toContain("Sitemap:");

  // ── versions: edit → publish → roll back to the first version
  await page
    .getByLabel("כותרת", { exact: true })
    .first()
    .fill("מאפיית הכפר — גרסה 2");
  await page.getByRole("button", { name: "שמירה ופרסום" }).click();
  await expect(page.getByText("העמוד פורסם")).toBeVisible();
  await eventually(store, `http://${o.slug}.localhost:3000/`, () =>
    expect(
      store.getByRole("heading", { name: "מאפיית הכפר — גרסה 2" }),
    ).toBeVisible({ timeout: 2000 }),
  );

  await page.reload();
  const rows = page.getByRole("listitem").filter({ hasText: "פרסום גרסה זו" });
  await expect(rows).toHaveCount(2);
  await rows.last().getByRole("button", { name: "פרסום גרסה זו" }).click(); // oldest = version 1
  await expect(rows.last()).toContainText("מפורסמת כרגע"); // wait for the server action to finish
  await eventually(store, `http://${o.slug}.localhost:3000/`, () =>
    expect(
      store.getByRole("heading", { name: "מאפיית הכפר", exact: true }),
    ).toBeVisible({ timeout: 2000 }),
  );

  // ── signed preview
  const href = await page
    .getByRole("link", { name: /תצוגה מקדימה/ })
    .getAttribute("href");
  await store.goto(`${"http://app.localhost:3000"}${href}`);
  await expect(store.getByText("תצוגה מקדימה של הטיוטה")).toBeVisible();
  await store.goto(`http://app.localhost:3000${href}x`);
  await expect(store.getByText("This page could not be found")).toBeVisible();

  // ── theme: primary color reaches the storefront (cache invalidated by tag)
  await page.goto(`${o.base}/design`);
  await page.getByLabel("צבע ראשי").fill("#aa0000");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("העיצוב נשמר")).toBeVisible();
  await eventually(store, `http://${o.slug}.localhost:3000/`, () =>
    expect(store.locator("header")).toHaveCSS(
      "background-color",
      "rgb(170, 0, 0)",
      { timeout: 2000 },
    ),
  );

  await o.ctx.close();
  await sctx.close();
});
