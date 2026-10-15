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

test("project chat refreshes an authorized member through the live socket", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const password = "chat-browser-password-123";
  const ownerEmail = `chat-owner-${randomUUID()}@example.test`;
  const reviewerEmail = `chat-reviewer-${randomUUID()}@example.test`;
  const projectId = randomUUID();
  const reviewerContext = await browser.newContext();
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
    for (const name of ["0001-core.sql", "0002-support.sql", "0003-session-security.sql"]) {
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    }
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(80803)");
      const installed = await tx.query<{ name: string | null }>(
        "SELECT to_regclass('public.active_project_members')::text AS name",
      );
      if (installed.rows[0]?.name) return;
      for (const name of ["0009-project-invitations.sql", "0010-share-link-grants.sql"]) {
        await tx.query(
          readFileSync(
            resolve(import.meta.dirname, `../../packages/db/migrations/${name}`),
            "utf8",
          ),
        );
      }
    });
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const owner = await db.query<{ id: string }>(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Chat Owner', $2, NOW()) RETURNING id",
      [ownerEmail, hash],
    );
    const reviewer = await db.query<{ id: string }>(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Chat Reviewer', $2, NOW()) RETURNING id",
      [reviewerEmail, hash],
    );
    await db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Chat browser project')",
      [projectId, owner.rows[0]!.id],
    );
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
      [projectId, reviewer.rows[0]!.id],
    );

    async function signIn(target: typeof page, email: string, name: string) {
      await target.goto(`${config.APP_ORIGIN}/login`);
      await target.getByLabel("Email").fill(email);
      await target.getByLabel("Password", { exact: true }).fill(password);
      await target.getByRole("button", { name: "Sign in" }).click();
      await expect(target.getByText(`Signed in as ${name}`)).toBeVisible();
      await target.goto(`${config.APP_ORIGIN}/project/${projectId}`);
      await expect(target.getByRole("region", { name: "Project chat" })).toBeVisible();
    }
    const reviewerPage = await reviewerContext.newPage();
    await signIn(page, ownerEmail, "Chat Owner");
    await signIn(reviewerPage, reviewerEmail, "Chat Reviewer");
    const ownerChat = page.getByRole("region", { name: "Project chat" });
    const reviewerChat = reviewerPage.getByRole("region", { name: "Project chat" });
    await expect(reviewerChat.getByRole("status")).toHaveText("Live updates connected");
    await ownerChat.getByRole("textbox", { name: "Chat message" }).fill("Shared draft is ready");
    await ownerChat.getByRole("button", { name: "Send message" }).click();
    await expect(ownerChat.getByText("Shared draft is ready")).toBeVisible();
    await expect(reviewerChat.getByText("Shared draft is ready")).toBeVisible({ timeout: 10_000 });

    const accessibility = await new AxeBuilder({ page: reviewerPage })
      .include(".project-chat")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  } finally {
    await reviewerContext.close();
    await db.close();
  }
});
