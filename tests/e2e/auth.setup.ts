import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { test as setup, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { AUTH_STATE_PATH, CSRF_PATH, SHARED_EMAIL, SHARED_PASSWORD } from "./shared-auth.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);
const api = "http://127.0.0.1:3000/api/v1";
const origin = "http://127.0.0.1:5173";

/**
 * Suite-wide authentication setup. Seeds ONE verified user and performs ONE
 * API login, saving the session cookies for specs that only need "a logged
 * in user". Specs that test registration, login, rate limiting or session
 * revocation keep their own throwaway flows. Sharing one login per suite
 * run isolates the Redis login rate-limit window across browser journeys
 * without changing production limits.
 */
setup("authenticate shared e2e user", async ({ request }) => {
  setup.setTimeout(60000);
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${api}/health/ready`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);

  const db = new DatabaseClient(config.DATABASE_URL);
  try {
    for (const name of ["0001-core.sql", "0002-support.sql", "0003-session-security.sql"]) {
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    }
    const passwordHash = await argon2.hash(SHARED_PASSWORD, { type: argon2.argon2id });
    await db.query(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'E2E Shared User', $2, NOW())
       ON CONFLICT (email_normalized) DO NOTHING`,
      [SHARED_EMAIL, passwordHash],
    );
    const userRes = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE email_normalized = $1",
      [SHARED_EMAIL],
    );
    const userId = userRes.rows[0]!.id;

    const loginRes = await request.post(`${api}/auth/login`, {
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      data: { email: SHARED_EMAIL, password: SHARED_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);
    const csrf = loginRes.headers()["x-csrf-token"] ?? "";
    expect(csrf).not.toBe("");
    await request.storageState({ path: AUTH_STATE_PATH });
    writeFileSync(CSRF_PATH, JSON.stringify({ csrf, userId }), "utf8");
  } finally {
    await db.close();
  }
});
