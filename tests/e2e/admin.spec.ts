import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { APP, newOwner, seedProduct } from "./helpers";

const run = Math.random().toString(36).slice(2, 8);

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

const axeBad = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 110)}`);

test("access control: only platform admins can see the admin area", async ({
  browser,
}) => {
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`${APP}/admin`);
  await expect(ap).toHaveURL(/\/sign-in\?next=%2Fadmin/);
  await anon.close();

  const owner = await newOwner(browser, "na", run);
  await owner.page.goto(`${APP}/admin/stores`);
  await expect(
    owner.page.getByText("This page could not be found"),
  ).toBeVisible(); // existence not revealed
  await owner.page.goto(`${APP}/admin`);
  await expect(
    owner.page.getByRole("heading", { name: "סקירת פלטפורמה" }),
  ).toHaveCount(0);
  // a server action can't be driven by a non-admin either: the store list API is just pages, and they all 404
  await owner.page.goto(`${APP}/admin/system`);
  await expect(
    owner.page.getByText("This page could not be found"),
  ).toBeVisible();
  await owner.ctx.close();
});

test("super-admin: overview, stores, suspend/activate really take effect, domains, WhatsApp, a11y in light+dark, mobile", async ({
  browser,
}) => {
  // a store with a live storefront to act on
  const victim = await newOwner(browser, "av", run);
  await seedProduct(victim.storeId, "חלה לשבת", "challah", 2000);

  const adm = await newOwner(browser, "ad", run);
  await sql("update users set platform_role = 'admin' where email = $1", [
    `ad-${run}@example.com`,
  ]);
  const { page } = adm;

  // ── overview
  await page.goto(`${APP}/admin`);
  await expect(
    page.getByRole("heading", { name: "סקירת פלטפורמה" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "היקף מכירות יומי — כל החנויות" }),
  ).toBeVisible();
  expect(await axeBad(page)).toEqual([]);

  // chart: hover shows a tooltip; keyboard works; table view available
  const chart = page.locator(".a-chart").first();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect(page.locator(".a-tooltip")).toBeVisible();
  await page.mouse.move(box.x - 40, box.y - 40);
  await expect(page.locator(".a-tooltip")).toHaveCount(0);
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".a-tooltip")).toBeVisible();
  await page.getByRole("button", { name: "הצגת טבלה" }).click();
  await expect(
    page.getByRole("table", { name: /היקף מכירות יומי/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "הצגת גרף" }).click();

  // dark theme: toggle works, persists across reload, still accessible
  await page.getByRole("button", { name: "מעבר למצב כהה" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "מעבר למצב בהיר" }),
  ).toBeVisible();
  expect(await axeBad(page)).toEqual([]);

  // keyboard shortcut focuses search; search finds the store by slug and by owner email
  await page.keyboard.press("/");
  await expect(
    page.getByRole("searchbox", { name: "חיפוש חנויות" }),
  ).toBeFocused();
  await page.keyboard.type(victim.slug);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/stores\?q=/);
  await expect(page.getByRole("link", { name: "חנות av" })).toBeVisible();
  expect(await axeBad(page)).toEqual([]);
  await page.goto(
    `${APP}/admin/stores?q=${encodeURIComponent(`av-${run}@example.com`)}`,
  );
  await expect(page.getByRole("link", { name: "חנות av" })).toBeVisible();
  await page.goto(`${APP}/admin/stores?q=${encodeURIComponent("%")}`);
  await expect(page.getByText("לא נמצאו חנויות")).toBeVisible();

  // ── store page
  await page.goto(`${APP}/admin/stores?q=${victim.slug}`);
  await page.getByRole("link", { name: "חנות av" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "חנות av" }),
  ).toBeVisible();
  expect(await axeBad(page)).toEqual([]);
  const SHOP = `http://${victim.slug}.localhost:3000`;
  const shop = await browser.newPage();
  await shop.goto(SHOP);
  await expect(shop.getByRole("link", { name: /חלה לשבת/ })).toBeVisible();

  // suspend: reason required, then storefront + owner dashboard are shut immediately
  await page.getByRole("button", { name: "השעיית חנות" }).click();
  await expect(page.getByRole("dialog", { name: /להשעות את/ })).toBeVisible();
  await page.getByRole("button", { name: "השעיה", exact: true }).click(); // empty reason: blocked by validation
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel(/סיבת ההשעיה/).fill("בדיקת מערכת");
  await page.getByRole("button", { name: "השעיה", exact: true }).click();
  await expect(page.getByText("החנות מושעית.")).toBeVisible();
  await expect(page.getByRole("button", { name: "הפעלה מחדש" })).toBeVisible();
  await expect(async () => {
    await shop.goto(SHOP);
    await expect(shop.getByText("This page could not be found")).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
  await victim.page.goto(`${victim.base}/products`);
  await expect(victim.page).toHaveURL(/\/suspended$/);
  await expect(
    victim.page.getByRole("heading", { name: "החנות הושעתה" }),
  ).toBeVisible();
  expect(
    (
      await sql<{ status: string }>("select status from stores where id=$1", [
        victim.storeId,
      ])
    )[0].status,
  ).toBe("suspended");

  // reactivate → both come back
  await page.getByRole("button", { name: "הפעלה מחדש" }).click();
  await expect(page.getByText("החנות מושעית.")).toHaveCount(0);
  await expect(async () => {
    await shop.goto(SHOP);
    await expect(shop.getByRole("link", { name: /חלה לשבת/ })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
  await victim.page.goto(`${victim.base}/products`);
  await expect(
    victim.page.getByRole("heading", { name: "מוצרים" }),
  ).toBeVisible();

  // ── plan, domains
  await page.getByLabel("שינוי תוכנית").selectOption("pro");
  await page.getByRole("button", { name: "שמירה" }).first().click();
  await expect(page.getByText("התוכנית עודכנה")).toBeVisible();
  await page
    .getByLabel("הוספת דומיין פרטי")
    .fill("evil.xn--4dbklvp7aj.xn--4dbrk0ce");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(
    page.getByText("אי אפשר להגדיר דומיין של הפלטפורמה"),
  ).toBeVisible();
  await page.getByLabel("הוספת דומיין פרטי").fill(`shop-${run}.example.co.il`);
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByText("הדומיין נוסף וממתין לאימות")).toBeVisible();
  await page
    .getByRole("button", { name: `אימות: shop-${run}.example.co.il` })
    .click();
  await expect(page.getByText("מאומת", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: `הגדרה כראשי: shop-${run}.example.co.il` })
    .click();
  await expect(page.getByText("ראשי", { exact: true })).toBeVisible();

  // ── WhatsApp: the token is accepted once and never shown again
  await page
    .getByLabel("Phone Number ID")
    .fill(`9${run.replace(/\D/g, "0")}1234567`.slice(0, 15).padEnd(12, "7"));
  await page.getByLabel("WhatsApp Business Account ID").fill("998877665544");
  await page.getByLabel("מספר תצוגה").fill("050-123-4567");
  await page.getByLabel(/טוקן גישה/).fill("EAAG-never-show-this-token");
  await page.getByRole("button", { name: "חיבור חשבון" }).click();
  await expect(page.getByText("חשבון הוואטסאפ נשמר")).toBeVisible();
  await page.reload();
  expect(await page.content()).not.toContain("EAAG-never-show-this-token");
  await expect(page.getByLabel(/טוקן גישה/)).toHaveValue("");
  const [wa] = await sql<{ t: string }>(
    "select access_token_encrypted as t from whatsapp_accounts where store_id=$1",
    [victim.storeId],
  );
  expect(wa.t).not.toContain("EAAG");

  // ── everything above was audited
  const acts = (
    await sql<{ action: string }>(
      "select action from platform_audit_log where store_id=$1",
      [victim.storeId],
    )
  ).map((r) => r.action);
  expect(acts).toEqual(
    expect.arrayContaining([
      "store.suspend",
      "store.activate",
      "store.plan_change",
      "domain.add",
      "domain.verify",
      "domain.set_primary",
      "whatsapp.connect",
    ]),
  );
  await page.goto(`${APP}/admin/audit`);
  await expect(page.getByText("השעיית חנות").first()).toBeVisible();
  expect(await axeBad(page)).toEqual([]);

  // ── remaining screens are accessible in dark mode too
  for (const path of ["/admin/domains", "/admin/system"]) {
    await page.goto(`${APP}${path}`);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await axeBad(page)).toEqual([]);
  }
  await page.goto(`${APP}/admin/domains`);
  await expect(page.getByText(`shop-${run}.example.co.il`)).toBeVisible();

  // ── mobile: hamburger appears, drawer opens/closes, hidden drawer is not focusable
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await mp.goto(`${APP}/sign-in`);
  await mp.getByLabel("אימייל").fill(`ad-${run}@example.com`);
  await mp.getByLabel("סיסמה").fill("correct-horse-9");
  await mp.getByRole("button", { name: "כניסה" }).click();
  await mp.waitForURL(`${APP}/`);
  await mp.goto(`${APP}/admin`);
  const menu = mp.getByRole("button", { name: "פתיחת התפריט" });
  await expect(menu).toBeVisible();
  await expect(mp.locator("#admin-nav")).toHaveAttribute("inert", "");
  expect(
    await mp.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await menu.click();
  await expect(mp.locator("#admin-nav")).not.toHaveAttribute("inert", "");
  await mp
    .locator("#admin-nav")
    .getByRole("link", { name: "חנויות", exact: true })
    .click();
  await expect(mp).toHaveURL(/\/admin\/stores/);
  await expect(mp.locator("#admin-nav")).toHaveAttribute("inert", ""); // closed again after navigating
  await m.close();
  await shop.close();

  // desktop has no hamburger
  await page.goto(`${APP}/admin`);
  await expect(page.getByRole("button", { name: "פתיחת התפריט" })).toBeHidden();
  await victim.ctx.close();
  await adm.ctx.close();
});
