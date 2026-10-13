import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { createProject } from "../../apps/api/src/modules/projects/create.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("signed multi-file upload persists nodes and reports per-file errors", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const email = `upload-browser-${randomUUID()}@example.test`;
  const password = "upload-browser-password-123";
  try {
    await expect
      .poll(async () => {
        try {
          return (await fetch("http://127.0.0.1:3000/api/v1/health/ready")).status;
        } catch {
          return 0;
        }
      })
      .toBe(200);
    for (const name of [
      "0001-core.sql",
      "0002-support.sql",
      "0003-session-security.sql",
      "0005-upload-intents.sql",
    ]) {
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    }
    const owner = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Upload Browser Writer', $2, NOW()) RETURNING id`,
      [email, await argon2.hash(password, { type: argon2.argon2id })],
    );
    const project = await createProject(db, owner.rows[0]!.id, {
      title: "Browser upload project",
      compiler: "pdflatex",
    });
    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Upload Browser Writer/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/project/${project.id}`);
    const picker = page.getByLabel("Upload project files");
    await expect(picker).toBeVisible();
    await picker.setInputFiles([
      {
        name: "references.bib",
        mimeType: "text/plain",
        buffer: Buffer.from("@book{sample,title={A}}"),
      },
      {
        name: "style.sty",
        mimeType: "text/plain",
        buffer: Buffer.from("\\ProvidesPackage{style}"),
      },
    ]);
    await expect(page.getByRole("treeitem", { name: "references.bib (file)" })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: "style.sty (file)" })).toBeVisible();
    await picker.setInputFiles({
      name: "references.bib",
      mimeType: "text/plain",
      buffer: Buffer.from("@book{sample,title={A}}"),
    });
    await expect(page.getByText("A file with this name already exists.")).toBeVisible();
    const count = await db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM project_nodes WHERE project_id = $1 AND name = 'references.bib' AND deleted_at IS NULL",
      [project.id],
    );
    expect(Number(count.rows[0]?.count)).toBe(1);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      audit.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  } finally {
    await db.close();
  }
});
