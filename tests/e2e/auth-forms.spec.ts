import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { createTrustedRegistrationInvitation } from "../../apps/api/src/modules/auth/register.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

async function mailLink(recipient: string, subject: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(`${config.MAILPIT_URL}/api/v1/messages`);
      expect(response.ok).toBe(true);
      const inbox = (await response.json()) as {
        messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
      };
      id = inbox.messages.find(
        (message) =>
          message.Subject === subject && message.To.some((to) => to.Address === recipient),
      )?.ID;
      return id;
    })
    .toBeTruthy();
  const detailResponse = await fetch(`${config.MAILPIT_URL}/api/v1/message/${id}`);
  expect(detailResponse.ok).toBe(true);
  const detail = (await detailResponse.json()) as { Text: string };
  const link = detail.Text.match(/http:\/\/127\.0\.0\.1:5173\/[^\s]+/)?.[0];
  expect(link).toBeTruthy();
  return link!;
}

test("trusted registration, verification, session and single-use recovery work in the browser", async ({
  page,
}) => {
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `browser-${randomUUID()}@example.test`;
  const firstPassword = "correct-password-123";
  const newPassword = "replacement-password-123";
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
    const invitation = await createTrustedRegistrationInvitation(db, email, "Browser Writer");
    await page.goto(`${config.APP_ORIGIN}/register#invitation=${invitation}`);
    await expect(page).not.toHaveURL(/#invitation=/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Display name").fill("Browser Writer");
    await page.getByLabel("Password", { exact: true }).fill(firstPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");

    await page.goto(await mailLink(email, "Verify your LaTeX Workspace email"));
    await expect(page).not.toHaveURL(/#token=/);
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByRole("status")).toContainText("Email verified");
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByRole("alert")).toContainText("verification code");

    await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(firstPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("status")).toContainText("Signed in as Browser Writer");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Signed in as Browser Writer");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("status")).toContainText("Signed out");

    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("check your email");

    await page.goto(await mailLink(email, "Reset your LaTeX Workspace password"));
    await expect(page).not.toHaveURL(/#token=/);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("status")).toContainText("Password reset");

    await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("status")).toContainText("Signed in as Browser Writer");
  } finally {
    await db.close();
  }
});

test("form keyboard access, axe checks, rate limit and network feedback", async ({ page }) => {
  for (const path of ["register", "verify-email", "login", "forgot-password", "reset-password"]) {
    await page.goto(`/${path}`);
    await expect(page.locator("form")).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  }
  await page.goto("/forgot-password");
  await page.getByLabel("Email").focus();
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeFocused();
  await page.route("**/api/v1/auth/password/forgot", (route) =>
    route.fulfill({ status: 429, body: "", headers: { "Retry-After": "60" } }),
  );
  await page.getByLabel("Email").fill("writer@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many attempts");
  await expect(page.getByRole("alert")).toBeFocused();
  await page.unroute("**/api/v1/auth/password/forgot");
  await page.route("**/api/v1/auth/password/forgot", (route) => route.abort());
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection failed");
});
