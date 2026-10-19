import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { createAuthenticatedContext } from "./authenticated-context.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("Academic project rejects missing SyncTeX jobs and returns statistics", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);

  // Per-context session: session reads rotate the token, so one stored
  // storageState cannot be reused by another context.
  const { context, csrf: csrfToken } = await createAuthenticatedContext(browser);
  const request = context.request;

  // 1. Backend health readiness
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

  // 2. Create academic project (shared session already authenticated)
  const createProjRes = await request.post("http://127.0.0.1:3000/api/v1/projects", {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
    data: { title: `Academic Project ${randomUUID()}` },
  });
  expect(createProjRes.status()).toBe(201);
  const project = await createProjRes.json();
  const projectId = project.id;
  expect(projectId).toBeDefined();
  const missingJobId = randomUUID();

  // 5. Test SyncTeX Forward lookup endpoint
  const forwardRes = await request.post(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/synctex/forward`,
    {
      headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
      data: {
        jobId: missingJobId,
        fileId: project.mainFileId,
        line: 12,
        column: 1,
      },
    },
  );
  // A job without a compiled SyncTeX artifact must stay unavailable.
  expect(forwardRes.status()).toBe(404);

  // 6. Test SyncTeX Inverse lookup endpoint
  const inverseRes = await request.post(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/synctex/inverse`,
    {
      headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
      data: {
        jobId: missingJobId,
        page: 1,
        x: 100,
        y: 200,
      },
    },
  );
  expect(inverseRes.status()).toBe(404);

  // 7. Test Project Statistics endpoint
  const statsRes = await request.get(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/statistics`,
    {
      headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
    },
  );
  expect(statsRes.status()).toBe(200);
  const stats = await statsRes.json();
  expect(stats.fileCount).toBe(1);
  expect(typeof stats.approximateWords).toBe("number");
  expect(typeof stats.sizeBytes).toBe("number");
  expect(stats.lastCompilationAt).toBeNull();

  await context.close();
  await db.close();
});
