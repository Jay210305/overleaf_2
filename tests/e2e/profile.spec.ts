import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("profile preferences persist and a selected browser session can be revoked", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `profile-${randomUUID()}@example.test`;
  const password = "profile-password-123";
  const other = await browser.newContext();
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch("http://127.0.0.1:3000/api/v1/health/ready")).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
    await db.query(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Profile Writer', $2, NOW())",
      [email, await argon2.hash(password, { type: argon2.argon2id })],
    );
    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Profile Writer/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/settings/profile`);
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await page.getByLabel("Display name").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save profile" })).toBeFocused();
    await page.getByLabel("Display name").fill("Updated Profile Writer");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    await page.getByLabel("Locale").fill("es-PE");
    await page.getByLabel("Timezone").fill("America/Lima");
    await page.getByLabel("Theme").selectOption("dark");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status")).toContainText("Preferences saved.");
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Updated Profile Writer");
    await expect(page.getByLabel("Locale")).toHaveValue("es-PE");
    await expect(page.getByLabel("Timezone")).toHaveValue("America/Lima");
    await expect(page.getByLabel("Theme")).toHaveValue("dark");
    await expect(page.locator(".shell")).toHaveClass(/dark/);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);

    const otherPage = await other.newPage();
    await otherPage.goto(`${config.APP_ORIGIN}/login`);
    await otherPage.getByLabel("Email").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill(password);
    await otherPage.getByRole("button", { name: "Sign in" }).click();
    await expect(otherPage.getByText(/Signed in as Updated Profile Writer/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Revoke session", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Revoke session", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Session revoked.");
    await otherPage.goto(`${config.APP_ORIGIN}/settings/profile`);
    await expect(otherPage.getByRole("alert")).toContainText("session expired");
  } finally {
    await other.close();
    await db.close();
  }
});
