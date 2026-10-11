import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { createServer } from "../../apps/api/src/server.js";

loadEnvFile(".env");
const origin = "http://127.0.0.1:5173";
const core = readFileSync(
  resolve(import.meta.dirname, "../../packages/db/migrations/0001-core.sql"),
  "utf8",
);
const sessionMigration = readFileSync(
  resolve(import.meta.dirname, "../../packages/db/migrations/0003-session-security.sql"),
  "utf8",
);
const oldPassword = "old-password-123";
const newPassword = "new-password-456";

describe("S02-T03 password recovery against PostgreSQL", () => {
  let db: DatabaseClient;
  let app: ReturnType<typeof createServer>;
  const delivered: Array<{ email: string; token: string }> = [];
  let email: string;
  let userId: string;

  beforeAll(async () => {
    db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
    await db.query(core);
    await db.query(sessionMigration);
    email = `recover-${randomUUID()}@example.test`;
    const inserted = await db.query<{ id: string }>(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Recovery User', $2, NOW()) RETURNING id",
      [email, await argon2.hash(oldPassword, { type: argon2.argon2id })],
    );
    userId = inserted.rows[0]!.id;
    app = createServer({
      checkReadiness: async () => true,
      db,
      origin,
      logger: false,
      sendPasswordReset: async (recipient, token) => {
        delivered.push({ email: recipient, token });
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await db.close();
  });

  const forgot = (address: string, requestOrigin = origin, csrf = "recovery-bootstrap") =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      headers: { origin: requestOrigin, "x-csrf-token": csrf },
      payload: { email: address },
    });
  const reset = (token: string, password = newPassword) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: { token, password },
    });
  const login = (password: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email, password },
    });

  it("returns the same accepted response for known and unknown addresses", async () => {
    const before = delivered.length;
    const known = await forgot(`  ${email.toUpperCase()}  `);
    const unknown = await forgot(`unknown-${randomUUID()}@example.test`);
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
    expect(known.headers["content-type"]).toBe(unknown.headers["content-type"]);
    expect(delivered).toHaveLength(before + 1);
    expect(delivered.at(-1)!.email).toBe(email);
    const raw = delivered.at(-1)!.token;
    const stored = await db.query<{ token_hash: string; expires_at: Date; used_at: Date | null }>(
      "SELECT token_hash, expires_at, used_at FROM verification_tokens WHERE user_id = $1 AND purpose = 'password_reset' AND token_hash = $2",
      [userId, createHash("sha256").update(raw).digest("hex")],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(stored.rows[0]!.token_hash).not.toBe(raw);
    expect(stored.rows[0]!.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(stored.rows[0]!.used_at).toBeNull();
  });

  it("consumes one reset token, changes the password and revokes existing sessions", async () => {
    const oldSession = await login(oldPassword);
    expect(oldSession.statusCode).toBe(200);
    const cookie = String(oldSession.headers["set-cookie"]).split(";")[0]!;
    expect((await forgot(email)).statusCode).toBe(202);
    const token = delivered.at(-1)!.token;
    expect((await reset(token)).statusCode).toBe(200);
    expect((await reset(token)).statusCode).toBe(401);
    const sessions = await db.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(sessions.rows.length).toBeGreaterThan(0);
    expect(sessions.rows.every((row) => row.revoked_at !== null)).toBe(true);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { origin, cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect((await login(oldPassword)).statusCode).toBe(401);
    expect((await login(newPassword)).statusCode).toBe(200);
  });

  it("rejects forged Origin and CSRF without issuing a reset token", async () => {
    const before = delivered.length;
    expect((await forgot(email, "https://foreign.example")).statusCode).toBe(403);
    expect((await forgot(email, origin, "")).statusCode).toBe(403);
    expect(delivered).toHaveLength(before);
  });

  it("delivers a redeemable reset link through local Mailpit", async () => {
    const mail = (await import("../../apps/api/src/modules/auth/mail.js")) as unknown as {
      createSmtpPasswordResetSender?: (
        smtp: string,
        from: string,
        appOrigin: string,
      ) => (recipient: string, token: string) => Promise<void>;
    };
    expect(mail.createSmtpPasswordResetSender).toBeTypeOf("function");
    const sender = mail.createSmtpPasswordResetSender!(
      "smtp://127.0.0.1:51025",
      "verification@example.test",
      origin,
    );
    const smtpApp = createServer({
      checkReadiness: async () => true,
      db,
      origin,
      logger: false,
      sendPasswordReset: sender,
    });
    const recipient = `smtp-reset-${randomUUID()}@example.test`;
    try {
      await db.query(
        "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'SMTP Recovery', $2, NOW())",
        [recipient, await argon2.hash(oldPassword, { type: argon2.argon2id })],
      );
      const sent = await smtpApp.inject({
        method: "POST",
        url: "/api/v1/auth/password/forgot",
        headers: { origin, "x-csrf-token": "recovery-bootstrap" },
        payload: { email: recipient },
      });
      expect(sent.statusCode).toBe(202);
      const inbox = await fetch(`${parseServerConfig(process.env).MAILPIT_URL}/api/v1/messages`);
      const listing = (await inbox.json()) as {
        messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
      };
      const message = listing.messages.find((item) =>
        item.To.some((to) => to.Address === recipient),
      );
      expect(message?.Subject).toBe("Reset your LaTeX Workspace password");
      const detailResponse = await fetch(
        `${parseServerConfig(process.env).MAILPIT_URL}/api/v1/message/${message!.ID}`,
      );
      const detail = (await detailResponse.json()) as { Text: string };
      const token = detail.Text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
      expect(token).toBeTruthy();
      const stored = await db.query<{ token_hash: string }>(
        "SELECT token_hash FROM verification_tokens WHERE user_id = (SELECT id FROM users WHERE email_normalized = $1) AND purpose = 'password_reset'",
        [recipient],
      );
      expect(stored.rows[0]?.token_hash).toBe(createHash("sha256").update(token!).digest("hex"));
    } finally {
      await smtpApp.close();
    }
  });
});
