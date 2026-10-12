import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { createServer } from "../../apps/api/src/server.js";
import type { SendPasswordReset } from "../../apps/api/src/modules/auth/password-reset.js";

loadEnvFile(".env");
export const origin = "http://127.0.0.1:5173";

export async function createSessionFixture(
  customOrigin = origin,
  secureCookies = false,
  sendPasswordReset?: SendPasswordReset,
) {
  const db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
  const core = readFileSync(
    resolve(import.meta.dirname, "../../packages/db/migrations/0001-core.sql"),
    "utf8",
  );
  const sessions = readFileSync(
    resolve(import.meta.dirname, "../../packages/db/migrations/0003-session-security.sql"),
    "utf8",
  );
  await db.query(core);
  await db.query(
    readFileSync(
      resolve(import.meta.dirname, "../../packages/db/migrations/0002-support.sql"),
      "utf8",
    ),
  );
  await db.query(sessions);
  const app = createServer({
    checkReadiness: async () => true,
    db,
    origin: customOrigin,
    secureCookies,
    logger: false,
    sendPasswordReset,
  });
  const password = "correct-password-123";
  async function seed(verified = true, disabled = false) {
    const email = `session-${randomUUID()}@example.test`;
    const result = await db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at, disabled_at)
       VALUES ($1, 'Session User', $2, $3, $4) RETURNING id`,
      [
        email,
        await argon2.hash(password, { type: argon2.argon2id }),
        verified ? new Date() : null,
        disabled ? new Date() : null,
      ],
    );
    return { email, id: result.rows[0]!.id };
  }
  function login(email: string, suppliedPassword = password) {
    return app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: customOrigin, "x-csrf-token": "login-bootstrap" },
      payload: { email, password: suppliedPassword },
    });
  }
  async function close() {
    await app.close();
    await db.close();
  }
  return { db, app, seed, login, close, origin: customOrigin };
}
