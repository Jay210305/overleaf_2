import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { createServer } from "../../apps/api/src/server.js";
import { createTrustedRegistrationInvitation } from "../../apps/api/src/modules/auth/register.js";
import { createSmtpVerificationSender } from "../../apps/api/src/modules/auth/mail.js";

loadEnvFile(".env");

const migration = readFileSync(
  resolve(import.meta.dirname, "../../packages/db/migrations/0001-core.sql"),
  "utf8",
);
const origin = "http://127.0.0.1:5173";

describe("S02-T01 trusted registration and verification", () => {
  let db: DatabaseClient;
  const delivered: Array<{ email: string; token: string }> = [];
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
    await db.query(migration);
    await db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0002-support.sql"),
        "utf8",
      ),
    );
    server = createServer({
      checkReadiness: async () => true,
      origin,
      db,
      sendVerification: async (email, token) => {
        delivered.push({ email, token });
      },
    });
  });
  afterAll(async () => {
    await server.close();
    await db.close();
  });

  const register = (
    email: string,
    invitation: string,
    csrf = "client-csrf-value",
    requestOrigin = origin,
  ) =>
    server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: {
        origin: requestOrigin,
        "x-csrf-token": csrf,
        "x-registration-invite": invitation,
      },
      payload: { email, password: "a-strong-password-123", displayName: "Trusted User" },
    });

  it("persists a normalized email and Argon2id hash, then consumes verification once", async () => {
    const email = `User-${randomUUID()}@Example.Test`;
    const invitation = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    const response = await register(`  ${email}  `, invitation);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true });
    const normalized = email.toLowerCase();
    const stored = await db.query<{
      id: string;
      password_hash: string;
      email_verified_at: Date | null;
    }>("SELECT id, password_hash, email_verified_at FROM users WHERE email_normalized = $1", [
      normalized,
    ]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(stored.rows[0]!.password_hash, "a-strong-password-123")).toBe(true);
    expect(stored.rows[0]?.email_verified_at).toBeNull();
    expect(delivered.at(-1)?.email).toBe(normalized);
    const token = delivered.at(-1)!.token;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const savedToken = await db.query<{ expires_at: Date; used_at: Date | null }>(
      "SELECT expires_at, used_at FROM verification_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    expect(savedToken.rows).toHaveLength(1);
    expect(savedToken.rows[0]!.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(savedToken.rows[0]?.used_at).toBeNull();
    const verify = () =>
      server.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        headers: { origin, "x-csrf-token": "client-csrf-value" },
        payload: { token },
      });
    expect((await verify()).statusCode).toBe(200);
    expect((await verify()).statusCode).toBe(401);
    const verified = await db.query<{ email_verified_at: Date | null }>(
      "SELECT email_verified_at FROM users WHERE id = $1",
      [stored.rows[0]!.id],
    );
    expect(verified.rows[0]?.email_verified_at).not.toBeNull();
  });

  it("denies unknown signup, foreign origins, missing CSRF and consumed invitations", async () => {
    const email = `deny-${randomUUID()}@example.test`;
    expect((await register(email, "unknown-invite")).statusCode).toBe(403);
    const invitation = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    expect(
      (await register(email, invitation, "client-csrf-value", "https://evil.example")).statusCode,
    ).toBe(403);
    expect((await register(email, invitation, "")).statusCode).toBe(403);
    expect((await register(email, invitation)).statusCode).toBe(202);
    expect((await register(email, invitation)).statusCode).toBe(403);
  });

  it("rejects expired and disabled verification tokens without verifying users", async () => {
    const email = `expiry-${randomUUID()}@example.test`;
    const invitation = await createTrustedRegistrationInvitation(db, email, "Trusted User");
    expect((await register(email, invitation)).statusCode).toBe(202);
    const token = delivered.at(-1)!.token;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.query(
      "UPDATE verification_tokens SET expires_at = NOW() - interval '1 second' WHERE token_hash = $1",
      [tokenHash],
    );
    const verify = () =>
      server.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        headers: { origin, "x-csrf-token": "client-csrf-value" },
        payload: { token },
      });
    expect((await verify()).statusCode).toBe(401);
    await db.query(
      "UPDATE verification_tokens SET expires_at = NOW() + interval '1 hour' WHERE token_hash = $1",
      [tokenHash],
    );
    await db.query("UPDATE users SET disabled_at = NOW() WHERE email_normalized = $1", [email]);
    expect((await verify()).statusCode).toBe(403);
    const row = await db.query<{ email_verified_at: Date | null }>(
      "SELECT email_verified_at FROM users WHERE email_normalized = $1",
      [email],
    );
    expect(row.rows[0]?.email_verified_at).toBeNull();
  });

  it("delivers a verification message through the local SMTP service", async () => {
    const config = parseServerConfig(process.env);
    const email = `smtp-${randomUUID()}@example.test`;
    const send = createSmtpVerificationSender(
      "smtp://127.0.0.1:51025",
      "verification@example.test",
      origin,
    );
    await send(email, "local-verification-token");
    const response = await fetch(`${config.MAILPIT_URL}/api/v1/messages`);
    expect(response.ok).toBe(true);
    const inbox = (await response.json()) as {
      messages: Array<{ To: Array<{ Address: string }> }>;
    };
    expect(
      inbox.messages.some((message) => message.To.some((recipient) => recipient.Address === email)),
    ).toBe(true);
  });

  it("allows registration without invitation when PUBLIC_SIGNUP_ENABLED is true", async () => {
    const original = process.env.PUBLIC_SIGNUP_ENABLED;
    process.env.PUBLIC_SIGNUP_ENABLED = "true";
    try {
      const email = `public-${randomUUID()}@example.test`;
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        headers: {
          origin,
          "x-csrf-token": "client-csrf-value",
        },
        payload: { email, password: "a-strong-password-123", displayName: "Public User" },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: true });
      expect(delivered.at(-1)?.email).toBe(email.toLowerCase());
    } finally {
      process.env.PUBLIC_SIGNUP_ENABLED = original;
    }
  });

  it("rejects invalid invitation codes even when PUBLIC_SIGNUP_ENABLED is true", async () => {
    const original = process.env.PUBLIC_SIGNUP_ENABLED;
    process.env.PUBLIC_SIGNUP_ENABLED = "true";
    try {
      const email = `public-short-invite-${randomUUID()}@example.test`;
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        headers: {
          origin,
          "x-csrf-token": "client-csrf-value",
          "x-registration-invite": "short-code",
        },
        payload: { email, password: "a-strong-password-123", displayName: "Public User" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("REGISTRATION_DENIED");
    } finally {
      process.env.PUBLIC_SIGNUP_ENABLED = original;
    }
  });
});
