import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import * as Y from "yjs";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("anchored comment and reply remain usable in the workspace", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `comments-browser-${randomUUID()}@example.test`;
  const password = "comments-browser-password-123";
  const projectId = randomUUID();
  const fileId = randomUUID();
  const doc = new Y.Doc();
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
      "0011-comment-context.sql",
    ]) {
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Comment Owner', $2, NOW()) RETURNING id`,
      [email, passwordHash],
    );
    const userId = user.rows[0]!.id;
    await db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Comment browser project')",
      [projectId, userId],
    );
    await db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    doc.getText("content").insert(0, "Before target after");
    await db.query(
      "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
      [fileId, projectId],
    );
    await db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 1, $2, $3)",
      [fileId, userId, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );

    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Comment Owner/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/project/${projectId}`);
    await page.getByRole("treeitem", { name: "main.tex (file)" }).click();
    const panel = page.getByRole("region", { name: "Comment anchors" });
    const source = panel.getByRole("textbox", { name: "Source text for comment selection" });
    await expect(source).toHaveValue("Before target after");
    await source.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(7, 13);
      textarea.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await panel.getByRole("textbox", { name: "Comment body" }).fill("Please check target");
    await expect(panel.getByRole("button", { name: "Add comment" })).toBeEnabled();
    await panel.getByRole("button", { name: "Add comment" }).click();
    await expect(panel.locator("mark")).toHaveText("target");
    await expect(panel.locator("mark").locator("..")).toContainText("Before target after");
    await panel.getByRole("textbox", { name: "Reply to this comment" }).fill("Checked");
    await panel.getByRole("button", { name: "Post reply" }).click();
    await expect(panel.getByText("Checked")).toBeVisible();
    await panel.getByRole("button", { name: "Resolve comment" }).click();
    await expect(panel.getByText("Status: resolved")).toBeVisible();
    await panel.getByRole("button", { name: "Reopen comment" }).click();
    await expect(panel.getByText("Status: open")).toBeVisible();

    await source.focus();
    await source.press("ControlOrMeta+A");
    await expect
      .poll(() => source.evaluate((element) => (element as HTMLTextAreaElement).selectionEnd))
      .toBe(19);
    await panel.getByRole("textbox", { name: "Comment body" }).fill("Keyboard selected range");
    await expect(panel.getByRole("button", { name: "Add comment" })).toBeEnabled();

    const accessibility = await new AxeBuilder({ page })
      .include(".comment-anchors")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);
  } finally {
    doc.destroy();
    await db.close();
  }
});

test("deleted comment range shows a detached reason instead of moving", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `comments-detached-${randomUUID()}@example.test`;
  const password = "comments-detached-password-123";
  const projectId = randomUUID();
  const fileId = randomUUID();
  const doc = new Y.Doc();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
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
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Detached Owner', $2, NOW()) RETURNING id`,
      [email, passwordHash],
    );
    const userId = user.rows[0]!.id;
    await db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Detached project')", [
      projectId,
      userId,
    ]);
    await db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    doc.getText("content").insert(0, "Before target after");
    await db.query(
      "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
      [fileId, projectId],
    );
    await db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 1, $2, $3)",
      [fileId, userId, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );

    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Detached Owner/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/project/${projectId}`);
    await page.getByRole("treeitem", { name: "main.tex (file)" }).click();
    const panel = page.getByRole("region", { name: "Comment anchors" });
    const source = panel.getByRole("textbox", { name: "Source text for comment selection" });
    await source.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(7, 13);
      textarea.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await panel.getByRole("textbox", { name: "Comment body" }).fill("Doomed range");
    await panel.getByRole("button", { name: "Add comment" }).click();
    await expect(panel.getByText("Doomed range")).toBeVisible();

    doc.getText("content").delete(7, 6);
    await db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 2, $2, $3)",
      [fileId, userId, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );
    await db.query("UPDATE text_documents SET last_persisted_seq = 2 WHERE file_id = $1", [fileId]);
    await page.reload();
    await expect(panel.getByText("Doomed range")).toBeVisible();
    await expect(panel.getByText("Anchor unavailable: selected range changed.")).toBeVisible();
    await expect(panel.locator("mark")).toHaveCount(0);
  } finally {
    doc.destroy();
    await db.close();
  }
});
