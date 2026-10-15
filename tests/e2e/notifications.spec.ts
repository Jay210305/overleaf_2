import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("recipient reads a private mention notification from the dashboard", async ({ page }) => {
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `notification-browser-${randomUUID()}@example.test`;
  const password = "notification-browser-password-123";
  const projectId = randomUUID();
  const sourceId = randomUUID();
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
        { timeout: 30_000 },
      )
      .toBe(200);
    for (const name of [
      "0001-core.sql",
      "0002-support.sql",
      "0003-session-security.sql",
      "0012-notification-idempotency.sql",
    ])
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    const activeMembers = await db.query<{ name: string | null }>(
      "SELECT to_regclass('public.active_project_members')::text AS name",
    );
    if (!activeMembers.rows[0]?.name)
      await db.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations/0010-share-link-grants.sql"),
          "utf8",
        ),
      );
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Notification Recipient', $2, NOW()) RETURNING id`,
      [email, await argon2.hash(password, { type: argon2.argon2id })],
    );
    const userId = user.rows[0]!.id;
    await db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Shared paper')", [
      projectId,
      userId,
    ]);
    await db.query(
      "INSERT INTO notifications (user_id, type, payload_json) VALUES ($1, 'mention', $2)",
      [userId, JSON.stringify({ projectId, sourceId })],
    );

    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Notification Recipient/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/dashboard`);
    const feed = page.getByRole("region", { name: "Notifications" });
    await expect(feed.getByRole("link", { name: /mentioned you in Shared paper/ })).toBeVisible();
    await feed.getByRole("button", { name: "Mark read" }).click();
    await expect(feed.getByText("Read")).toBeVisible();
    await page.reload();
    await expect(feed.getByText("Read")).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .include(".notification-list")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  } finally {
    await db.close();
  }
});
