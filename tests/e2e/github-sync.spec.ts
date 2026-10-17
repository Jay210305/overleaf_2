import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { AUTH_STATE_PATH, readSharedCsrf } from "./shared-auth.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("project workspace mounts the real GitHub sync panel", async ({ browser }) => {
  const db = new DatabaseClient(config.DATABASE_URL);
  try {
    const { userId } = readSharedCsrf();
    const project = await createProject(db, userId, {
      title: "GitHub sync workspace",
      compiler: "pdflatex",
    });
    const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
    try {
      const page = await context.newPage();
      await page.goto(`${config.APP_ORIGIN}/project/${project.id}`);
      const control = page.getByRole("button", { name: "GitHub Sync" });
      await expect(control).toBeVisible();
      const status = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/projects/${project.id}/integrations/github/status`) &&
          response.request().method() === "POST",
      );
      await control.click();
      await status;
      await expect(page.getByRole("region", { name: "GitHub synchronization" })).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    await db.close();
  }
});
