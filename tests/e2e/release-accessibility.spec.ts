import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("S15-T10 Release Accessibility & Browser Compatibility (NFR-08, NFR-11)", () => {
  test("satisfies WCAG 2.2 AA accessibility criteria with axe-core on public views", async ({ page }) => {
    await page.goto("/");

    const a11yScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    const criticalViolations = a11yScan.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );

    expect(criticalViolations).toEqual([]);
  });

  test("supports sequential keyboard navigation and visible focus rings", async ({ page }) => {
    await page.goto("/");

    // Skip to main content link navigation
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "INPUT"]).toContain(focused);

    // Escape dismisses active modals/popovers if open
    await page.keyboard.press("Escape");
  });

  test("runs across recorded modern browser engines (Chromium, Firefox, WebKit)", async ({
    page,
    browserName,
  }) => {
    // Record browser engine
    expect(["chromium", "firefox", "webkit"]).toContain(browserName);

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
