import { expect, test } from "@playwright/test";

test("home renders in Hebrew RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { level: 1, name: /החנות שמנהלים בשיחה/ }),
  ).toBeVisible();
});
