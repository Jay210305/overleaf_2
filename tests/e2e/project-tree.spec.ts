import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { AUTH_STATE_PATH } from "./shared-auth.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

// Authenticated once per suite run (see auth.setup.ts) so browser journeys
// share one login instead of consuming the Redis login rate-limit window.
test.use({ storageState: AUTH_STATE_PATH });

test("project and file tree journey: create, mutate tree, reload persistence, and tenant isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);

  // Ensure database migrations and health
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

  // Apply migrations if needed
  await db.query(
    readFileSync(
      resolve(import.meta.dirname, "../../packages/db/migrations/0001-core.sql"),
      "utf8",
    ),
  );
  await db.query(
    readFileSync(
      resolve(import.meta.dirname, "../../packages/db/migrations/0002-support.sql"),
      "utf8",
    ),
  );
  await db.query(
    readFileSync(
      resolve(import.meta.dirname, "../../packages/db/migrations/0003-session-security.sql"),
      "utf8",
    ),
  );

  // 1. Shared session from auth.setup.ts: the dashboard below only renders
  // for authenticated users, so reaching it proves the session is live.

  // 2. NAVIGATE TO DASHBOARD
  await page.goto(`${config.APP_ORIGIN}/dashboard`);
  await expect(page.getByRole("region", { name: "Projects dashboard" })).toBeVisible();

  // Accessibility audit on dashboard
  const dashboardAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    dashboardAxe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);

  // 3. CREATE NEW PROJECT VIA DASHBOARD MODAL
  const projectTitle = `Thesis Project ${randomUUID().slice(0, 8)}`;
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("dialog", { name: "Create New Project" })).toBeVisible();
  await page.getByLabel("Project Title").fill(projectTitle);
  await page.getByLabel("Description").fill("Automated E2E Journey Thesis");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Expect project title link to appear in dashboard
  const projectLink = page.getByRole("link", { name: projectTitle });
  await expect(projectLink).toBeVisible();

  // 4. NAVIGATE INTO PROJECT WORKSPACE
  await projectLink.click();
  await expect(page.getByRole("region", { name: "Project workspace" })).toBeVisible();

  // Verify tree loads with default main.tex
  const treePanel = page.getByRole("region", { name: "File tree panel" });
  await expect(treePanel).toBeVisible();
  await expect(page.getByText("main.tex")).toBeVisible();

  // 5. ACCESSIBILITY AUDIT ON WORKSPACE
  const workspaceAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    workspaceAxe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);

  // 6. CREATE FOLDER 'chapters'
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Name:").fill("chapters");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "chapters (folder)" })).toBeVisible();

  // 7. CREATE FILE 'ch1.tex' INSIDE 'chapters'
  await page.getByRole("button", { name: "Add file to chapters" }).click();
  await page.getByLabel("Name:").fill("ch1.tex");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "ch1.tex (file)" })).toBeVisible();

  // 8. RENAME 'ch1.tex' TO 'intro.tex'
  await page.getByRole("button", { name: "Rename ch1.tex" }).click();
  await page.getByLabel("New name:").fill("intro.tex");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "intro.tex (file)" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "ch1.tex (file)" })).not.toBeVisible();

  // 9. RELOAD PERSISTENCE: Reload the page and ensure all mutations persisted
  await page.reload();
  await expect(page.getByRole("region", { name: "Project workspace" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "main.tex (file)" })).toBeVisible();
  const chaptersFolder = page.getByRole("treeitem", { name: "chapters (folder)" });
  await expect(chaptersFolder).toBeVisible();
  await chaptersFolder.click();
  await expect(page.getByRole("treeitem", { name: "intro.tex (file)" })).toBeVisible();

  // 10. TENANT ISOLATION: An unauthenticated browser context cannot view the workspace or tree
  const unauthContext = await browser.newContext();
  const unauthPage = await unauthContext.newPage();
  await unauthPage.goto(page.url());
  await expect(
    unauthPage.getByText(/Please sign in|Project not found|access denied/i),
  ).toBeVisible();
  await unauthContext.close();

  // 11. DELETE FOLDER 'chapters' AND VERIFY CASCADE & PERSISTENCE
  await page.getByRole("button", { name: "Delete chapters" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // Both chapters and intro.tex are gone
  await expect(page.getByRole("treeitem", { name: "chapters (folder)" })).not.toBeVisible();
  await expect(page.getByRole("treeitem", { name: "intro.tex (file)" })).not.toBeVisible();

  // Reload page to verify deletion persisted
  await page.reload();
  await expect(page.getByRole("region", { name: "Project workspace" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "main.tex (file)" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "chapters (folder)" })).not.toBeVisible();
  await expect(page.getByRole("treeitem", { name: "intro.tex (file)" })).not.toBeVisible();
});
