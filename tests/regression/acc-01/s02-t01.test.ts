import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import { createServer } from "../../../apps/api/src/server.js";
import { createTrustedRegistrationInvitation } from "../../../apps/api/src/modules/auth/register.js";

loadEnvFile(".env");
const origin = "http://127.0.0.1:5173";
const migration = readFileSync(
  resolve(import.meta.dirname, "../../../packages/db/migrations/0001-core.sql"),
  "utf8",
);

describe("ACC-01 S02-T01 denial regressions", () => {
  let db: DatabaseClient;
  let app: ReturnType<typeof createServer>;
  beforeAll(async () => {
    db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
    await db.query(migration);
    app = createServer({
      checkReadiness: async () => true,
      db,
      origin,
      sendVerification: async () => {},
    });
  });
  afterAll(async () => {
    await app.close();
    await db.close();
  });

  const post = (email: string, invitation: string, body?: unknown) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin, "x-csrf-token": "client-csrf-value", "x-registration-invite": invitation },
      payload: body ?? { email, password: "a-strong-password-123", displayName: "Trusted User" },
    });

  it("rejects malformed requests without consuming the trusted invitation", async () => {
    const email = `invalid-${randomUUID()}@example.test`;
    const invite = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    const invalid = await post(email, invite, {
      email,
      password: "short",
      displayName: "Trusted User",
      role: "admin",
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers["content-type"]).toContain("application/problem+json");
    expect((await post(email, invite)).statusCode).toBe(202);
  });

  it("accepts exactly one concurrent use of an invitation", async () => {
    const email = `replay-${randomUUID()}@example.test`;
    const invite = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    const [first, second] = await Promise.all([post(email, invite), post(email, invite)]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([202, 403]);
    const tokens = await db.query<{ purpose: string }>(
      `SELECT purpose FROM verification_tokens WHERE user_id =
       (SELECT id FROM users WHERE email_normalized = $1) AND purpose = 'email_verify'`,
      [email],
    );
    expect(tokens.rows).toHaveLength(1);
  });

  it("rejects a valid invitation presented for another email", async () => {
    const email = `owner-${randomUUID()}@example.test`;
    const invite = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    expect((await post(`foreign-${randomUUID()}@example.test`, invite)).statusCode).toBe(403);
    expect((await post(email, invite)).statusCode).toBe(202);
  });

  it("restores the invitation when the mail provider rejects delivery", async () => {
    const email = `mail-retry-${randomUUID()}@example.test`;
    const invite = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    const failedMailApp = createServer({
      checkReadiness: async () => true,
      db,
      origin,
      sendVerification: async () => {
        throw new Error("provider unavailable");
      },
    });
    const failed = await failedMailApp.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin, "x-csrf-token": "client-csrf-value", "x-registration-invite": invite },
      payload: { email, password: "a-strong-password-123", displayName: "Trusted User" },
    });
    await failedMailApp.close();
    expect(failed.statusCode).toBe(502);
    const user = await db.query<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE email_normalized = $1",
      [email],
    );
    expect(user.rows[0]?.password_hash).toBeNull();
    expect((await post(email, invite)).statusCode).toBe(202);
  });

  it("does not issue a registration invitation for an already verified account", async () => {
    const email = `verified-${randomUUID()}@example.test`;
    await db.query(
      "INSERT INTO users (email_normalized, display_name, email_verified_at) VALUES ($1, 'Existing', NOW())",
      [email],
    );
    await expect(
      createTrustedRegistrationInvitation(db, email, "Trusted User"),
    ).rejects.toMatchObject({ status: 409 });
  });
});
