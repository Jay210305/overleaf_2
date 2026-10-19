import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("browser checks real API, navigation, theme and keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Service ready");
  const homeAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    homeAccessibility.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
});
test("connection failures are visible and recover", async ({ page }) => {
  await page.route("**/api/v1/health/ready", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Service unavailable");
  await page.unroute("**/api/v1/health/ready");
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Service ready");
});
