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

test("owner manages a member, invitation and bounded link in the workspace", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const db = new DatabaseClient(config.DATABASE_URL);
  const ownerEmail = `sharing-owner-${randomUUID()}@example.test`;
  const memberEmail = `sharing-member-${randomUUID()}@example.test`;
  const recipientEmail = `sharing-recipient-${randomUUID()}@example.test`;
  const password = "sharing-browser-password-123";
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
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Sharing Owner', $2, NOW()) RETURNING id`,
      [ownerEmail, hash],
    );
    const member = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Collaborator', $2, NOW()) RETURNING id`,
      [memberEmail, hash],
    );
    await db.query(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'Link Recipient', $2, NOW())`,
      [recipientEmail, hash],
    );
    const projectId = randomUUID();
    await db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Sharing browser project')",
      [projectId, owner.rows[0]!.id],
    );
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, member.rows[0]!.id],
    );

    await page.goto(`${config.APP_ORIGIN}/login`);
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as Sharing Owner/)).toBeVisible();
    await page.goto(`${config.APP_ORIGIN}/project/${projectId}`);
    await page.getByRole("button", { name: "Share project" }).click();
    const dialog = page.getByRole("dialog", { name: "Project sharing" });
    await expect(dialog.getByText(/Collaborator · EDITOR/)).toBeVisible();
    await dialog.getByLabel("Role for Collaborator").selectOption("VIEWER");
    await dialog.getByRole("button", { name: "Save role for Collaborator" }).click();
    await expect(dialog.getByText(/Collaborator · VIEWER/)).toBeVisible();

    // Invite the existing trusted account after removing its previous membership.
    await dialog.getByRole("button", { name: "Remove Collaborator" }).click();
    await dialog.getByLabel("Email").fill(memberEmail);
    const invitationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/invitations`) &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    expect((await invitationResponse).status()).toBe(201);
    await expect(
      dialog.getByRole("button", { name: `Revoke invitation for ${memberEmail}` }),
    ).toBeVisible();

    const accessibility = await new AxeBuilder({ page })
      .include(".share-dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      ),
    ).toEqual([]);

    const expiry = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
    await dialog.getByLabel("Link expiry").fill(expiry);
    await dialog.getByLabel("Maximum uses").fill("1");
    const linkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/share-links`) &&
        response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Create share link" }).click();
    const createdLinkResponse = await linkResponse;
    if (createdLinkResponse.status() !== 201) {
      const failure = (await createdLinkResponse.json()) as { code?: string };
      throw new Error(
        `Share-link creation returned ${createdLinkResponse.status()} ${failure.code ?? "unknown"}`,
      );
    }
    await expect(dialog.getByLabel("One-time share URL")).toHaveValue(
      /\/share-links#token=[A-Za-z0-9_-]{43}$/,
    );
    const oneTimeUrl = await dialog.getByLabel("One-time share URL").inputValue();
    const recipientContext = await browser.newContext();
    try {
      const recipientPage = await recipientContext.newPage();
      await recipientPage.goto(`${config.APP_ORIGIN}/login`);
      await recipientPage.getByLabel("Email").fill(recipientEmail);
      await recipientPage.getByLabel("Password", { exact: true }).fill(password);
      await recipientPage.getByRole("button", { name: "Sign in" }).click();
      await expect(recipientPage.getByText(/Signed in as Link Recipient/)).toBeVisible();
      await recipientPage.goto(oneTimeUrl);
      await expect(recipientPage.getByRole("heading", { name: "Share link" })).toBeVisible();
      expect(new URL(recipientPage.url()).hash).toBe("");
      await recipientPage.getByRole("button", { name: "Join project" }).click();
      await expect(recipientPage.getByRole("link", { name: "Open project" })).toBeVisible();
      await recipientPage.getByRole("link", { name: "Open project" }).click();
      await expect(recipientPage.getByText("Sharing browser project")).toBeVisible();
    } finally {
      await recipientContext.close();
    }
  } finally {
    await db.close();
  }
});
