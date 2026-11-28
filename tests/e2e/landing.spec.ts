import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HOME = "http://localhost:3000/"; // platform host

const bad = async (page: import("@playwright/test").Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 110)}`);

const transformOf = (page: import("@playwright/test").Page) =>
  page
    .locator(".lp-row")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);

test("landing: content, CTAs point at the dashboard host, RTL, accessible", async ({
  page,
}) => {
  await page.goto(HOME);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle(/החנות שמנהלים בשיחה/);
  await expect(
    page.getByRole("heading", { level: 1, name: /החנות שמנהלים בשיחה/ }),
  ).toBeVisible();

  const signUp = page.getByRole("link", { name: "פתחו חנות" }).first();
  await expect(signUp).toHaveAttribute(
    "href",
    "http://app.localhost:3000/sign-up",
  );
  await expect(page.getByRole("link", { name: "כניסה" })).toHaveAttribute(
    "href",
    "http://app.localhost:3000/sign-in",
  );

  // no claims we can't back yet: no invented savings percentages, WhatsApp marked as upcoming
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\d+%\s*(חיסכון|פחות|זול)/);
  await page
    .getByRole("button", { name: /מה עם הזמנות בוואטסאפ/ })
    .or(page.getByText("מה עם הזמנות בוואטסאפ?"))
    .first()
    .click();
  await expect(page.getByText(/כרגע בפיתוח/)).toBeVisible();

  // anchors work
  await page
    .getByRole("navigation", { name: "ראשי" })
    .getByRole("link", { name: "ניהול עם Claude" })
    .click();
  await expect(page).toHaveURL(/#claude$/);
  await expect(
    page.getByRole("heading", { name: /מה שעלה סוכנות/ }),
  ).toBeInViewport();

  expect(await bad(page)).toEqual([]);
});

test("landing: two tilted sliders move and respect reduced motion", async ({
  page,
  browser,
}) => {
  await page.goto(HOME);
  const rows = page.locator(".lp-row");
  await expect(rows).toHaveCount(2);
  const tilt = await page
    .locator(".lp-band")
    .evaluate((el) => getComputedStyle(el).transform);
  const m = tilt.match(/matrix\(([^)]+)\)/)!;
  const [a, b] = m[1].split(",").map(Number);
  expect(Math.round((Math.atan2(b, a) * 180) / Math.PI)).toBe(35); // exactly the requested 35°
  expect(
    await rows.nth(0).evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe(
    await rows.nth(1).evaluate((el) => getComputedStyle(el).animationName),
  ); // opposite directions

  const t1 = await transformOf(page);
  await page.waitForTimeout(700);
  const t2 = await transformOf(page);
  expect(t2).not.toBe(t1); // auto-moving

  // the decorative band is hidden from assistive tech
  await expect(page.locator(".lp-band")).toHaveAttribute("aria-hidden", "true");

  const rm = await browser.newContext({ reducedMotion: "reduce" });
  const rp = await rm.newPage();
  await rp.goto(HOME);
  expect(
    await rp
      .locator(".lp-row")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await rm.close();
});

test("landing: cost calculator uses the visitor's own numbers; FAQ opens", async ({
  page,
}) => {
  await page.goto(HOME);
  const result = page.getByRole("status").filter({ hasText: "ההוצאה שלכם" });
  await expect(result).toContainText("₪4,500");
  await page.getByLabel(/סוכנות או פרילנסר/).fill("5000");
  await page.getByLabel(/מי שמעלה מוצרים/).fill("2000");
  await page.getByLabel(/שעות שלכם בחודש/).fill("20");
  await expect(result).toContainText("₪7,000");
  await expect(result).toContainText("₪84,000 בשנה");
  await expect(result).toContainText("20 שעות");
  await page.getByLabel(/סוכנות או פרילנסר/).fill("abc");
  await expect(result).toContainText("₪2,000");
  await expect(result).toContainText("Claude, שמשולם בנפרד");

  const d = page.locator("details").first();
  await expect(d).not.toHaveAttribute("open", "");
  await d.getByText("צריך לדעת טכנולוגיה?").click();
  await expect(d).toHaveAttribute("open", "");
});

test("landing: mobile has no horizontal scroll and keeps the CTA", async ({
  browser,
}) => {
  for (const width of [390, 320]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 760 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(HOME);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "פתיחת חנות" })).toBeVisible();
    // the page itself and every element outside the decorative slider stay inside the viewport
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const out = [...document.querySelectorAll("header *, main *, footer *")]
        .filter((e) => !e.closest(".lp-stage"))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > w + 1 || r.left < -1);
        })
        .map((e) => e.tagName + "." + e.className);
      return { page: document.documentElement.scrollWidth > w, out };
    });
    expect(overflow, `width ${width}`).toEqual({ page: false, out: [] });
    if (width === 390) expect(await bad(page)).toEqual([]);
    await ctx.close();
  }
});
