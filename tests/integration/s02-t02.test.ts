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
const migration = readFileSync(
  resolve(import.meta.dirname, "../../packages/db/migrations/0001-core.sql"),
  "utf8",
);
const sessionMigration = readFileSync(
  resolve(import.meta.dirname, "../../packages/db/migrations/0003-session-security.sql"),
  "utf8",
);

describe("S02-T02 persistent cookie sessions", () => {
  let db: DatabaseClient;
  let app: ReturnType<typeof createServer>;
  let email: string;
  const password = "correct-password-123";

  beforeAll(async () => {
    db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
    await db.query(migration);
    await db.query(sessionMigration);
    email = `session-${randomUUID()}@example.test`;
    await db.query(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Session User', $2, NOW())",
      [email, await argon2.hash(password, { type: argon2.argon2id })],
    );
    app = createServer({ checkReadiness: async () => true, db, origin });
  });
  afterAll(async () => {
    await app.close();
    await db.close();
  });

  const login = (providedPassword = password, requestOrigin = origin) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: requestOrigin, "x-csrf-token": "login-bootstrap" },
      payload: { email, password: providedPassword },
    });

  it("issues only a hashed, host-only HttpOnly session and rotates it on session read", async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email, displayName: "Session User" });
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Domain=");
    const cookie = setCookie.split(";")[0]!;
    const token = cookie.split("=")[1]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const stored = await db.query<{ token_hash: string; csrf_hash: string; expires_at: Date }>(
      "SELECT token_hash, csrf_hash, expires_at FROM sessions WHERE token_hash = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash).not.toBe(token);
    expect(stored.rows[0]!.csrf_hash).not.toBe(response.headers["x-csrf-token"]);
    expect(stored.rows[0]!.expires_at.getTime()).toBeGreaterThan(Date.now());

    const current = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie, origin },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ email });
    const rotatedCookie = String(current.headers["set-cookie"]).split(";")[0]!;
    expect(rotatedCookie).not.toBe(cookie);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { cookie, origin },
        })
      ).statusCode,
    ).toBe(401);

    const csrf = String(current.headers["x-csrf-token"]);
    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: rotatedCookie, origin, "x-csrf-token": csrf },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect(String(loggedOut.headers["set-cookie"])).toContain("Max-Age=0");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { cookie: rotatedCookie, origin },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("denies wrong credentials, foreign origins and malformed login bodies", async () => {
    expect((await login("wrong-password-123")).statusCode).toBe(401);
    expect((await login("short")).statusCode).toBe(400);
    expect((await login(password, "https://foreign.example")).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: { origin, "x-csrf-token": "login-bootstrap" },
          payload: { email, password, admin: true },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("denies expired sessions even when a cookie remains present", async () => {
    const response = await login();
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    const token = cookie.split("=")[1]!;
    await db.query(
      "UPDATE sessions SET expires_at = NOW() - interval '1 second' WHERE token_hash = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { cookie, origin },
        })
      ).statusCode,
    ).toBe(401);
  });
});
