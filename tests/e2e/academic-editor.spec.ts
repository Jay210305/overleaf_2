import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("Academic project rejects missing SyncTeX jobs and returns statistics", async ({
  request,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);

  const userEmail = `e2e-academic-${randomUUID()}@example.test`;
  const password = "correct-password-123";

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

  // 2. Seed test user
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const userRes = await db.query<{ id: string }>(
    `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Academic Editor User', $2, NOW()) RETURNING id`,
    [userEmail, passwordHash],
  );
  expect(userRes.rows[0]?.id).toBeDefined();

  // 3. Authenticate
  const loginRes = await request.post("http://127.0.0.1:3000/api/v1/auth/login", {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": "login-bootstrap" },
    data: { email: userEmail, password },
  });
  expect(loginRes.status()).toBe(200);
  const csrfToken = loginRes.headers()["x-csrf-token"] ?? "";

  // 4. Create academic project
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
});
