import { createHash, randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import type { Browser, BrowserContext } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { SHARED_EMAIL } from "./shared-auth.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

function secret(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface AuthenticatedContext {
  context: BrowserContext;
  csrf: string;
  userId: string;
}

/**
 * Creates a browser context with its own session for the shared e2e user.
 *
 * `GET /api/v1/auth/session` rotates the session token and CSRF hash on every
 * read (see S02-T02), so a static `storageState` file cannot be reused across
 * contexts: the first context invalidates it. Seeding a distinct session per
 * context keeps the browser journeys isolated without extra login attempts
 * against the auth rate-limit window.
 */
export async function createAuthenticatedContext(browser: Browser): Promise<AuthenticatedContext> {
  const db = new DatabaseClient(config.DATABASE_URL);
  try {
    const found = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE email_normalized = $1",
      [SHARED_EMAIL],
    );
    const userId = found.rows[0]?.id;
    if (!userId) throw new Error("Shared e2e user is missing; run auth.setup.ts first.");

    const token = secret();
    const csrf = secret();
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, csrf_hash, expires_at, last_seen_at, device_label)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', NOW(), 'E2E')`,
      [userId, tokenHash(token), tokenHash(csrf)],
    );

    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "latex_session",
        value: token,
        url: config.APP_ORIGIN,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.addInitScript((value) => sessionStorage.setItem("csrf_token", value), csrf);
    return { context, csrf, userId };
  } finally {
    await db.close();
  }
}
