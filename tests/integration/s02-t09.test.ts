import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { writeAuditEvent } from "../../packages/db/src/repositories/audit.js";
import { createServer } from "../../apps/api/src/server.js";
import { createTrustedRegistrationInvitation } from "../../apps/api/src/modules/auth/register.js";

loadEnvFile(".env");
const origin = "http://127.0.0.1:5173";

describe("S02-T09 redacted audit persistence", () => {
  let db: DatabaseClient;
  let app: ReturnType<typeof createServer>;
  let userId: string;
  let email: string;
  const password = "audit-password-123";

  beforeAll(async () => {
    db = new DatabaseClient(parseServerConfig(process.env).DATABASE_URL);
    for (const name of ["0001-core.sql", "0002-support.sql", "0003-session-security.sql"])
      await db.query(
        readFileSync(resolve(import.meta.dirname, "../../packages/db/migrations", name), "utf8"),
      );
    app = createServer({
      checkReadiness: async () => true,
      db,
      origin,
      logger: false,
      sendVerification: async () => {},
    });
    email = `audit-${randomUUID()}@example.test`;
  });
  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it("records trusted creation, login and logout with request IDs and fixed redacted metadata", async () => {
    const invite = await createTrustedRegistrationInvitation(db, email, "Audit User");
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin, "x-csrf-token": "audit-bootstrap", "x-registration-invite": invite },
      payload: { email, password, displayName: "Audit User", source: "private-source-marker" },
    });
    // Strict request contracts reject source content before mutation.
    expect(register.statusCode).toBe(400);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin, "x-csrf-token": "audit-bootstrap", "x-registration-invite": invite },
      payload: { email, password, displayName: "Audit User" },
    });
    expect(accepted.statusCode).toBe(202);
    userId = (
      await db.query<{ id: string }>("SELECT id FROM users WHERE email_normalized = $1", [email])
    ).rows[0]!.id;
    const created = await db.query<{ request_id: string; metadata_redacted: unknown }>(
      "SELECT request_id, metadata_redacted FROM audit_events WHERE target_id = $1 AND action = 'account.created'",
      [userId],
    );
    expect(created.rows).toEqual([
      { request_id: accepted.headers["x-request-id"], metadata_redacted: {} },
    ]);
    await db.query("UPDATE users SET email_verified_at = NOW() WHERE id = $1", [userId]);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "audit-bootstrap" },
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin, cookie, "x-csrf-token": String(login.headers["x-csrf-token"]) },
    });
    expect(logout.statusCode).toBe(204);
    const events = await db.query<{
      action: string;
      request_id: string;
      metadata_redacted: unknown;
    }>(
      "SELECT action, request_id, metadata_redacted FROM audit_events WHERE actor_id = $1 ORDER BY occurred_at, action",
      [userId],
    );
    expect(events.rows.map((row) => row.action).sort()).toEqual([
      "account.created",
      "session.login",
      "session.revoked",
    ]);
    expect(events.rows.find((row) => row.action === "session.login")?.request_id).toBe(
      login.headers["x-request-id"],
    );
    expect(events.rows.find((row) => row.action === "session.revoked")?.request_id).toBe(
      logout.headers["x-request-id"],
    );
    expect(JSON.stringify(events.rows)).not.toContain(password);
    expect(JSON.stringify(events.rows)).not.toContain(invite);
    expect(JSON.stringify(events.rows)).not.toContain("private-source-marker");
  });

  it("rolls back the associated mutation when the audit insert fails", async () => {
    const actorId = userId;
    await expect(
      db.transaction(async (tx) => {
        await tx.query("UPDATE users SET display_name = 'Should Roll Back' WHERE id = $1", [
          actorId,
        ]);
        await writeAuditEvent(tx, {
          action: "session.revoked",
          actorId,
          targetId: randomUUID(),
          requestId: "invalid-request-id",
        });
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ display_name: string }>("SELECT display_name FROM users WHERE id = $1", [
          actorId,
        ])
      ).rows[0]?.display_name,
    ).toBe("Audit User");
  });

  it("does not audit denied login and records password-reset session revocation", async () => {
    const before = (
      await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE actor_id = $1",
        [userId],
      )
    ).rows[0]!.count;
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "audit-bootstrap" },
      payload: { email, password: "wrong-password-123" },
    });
    expect(denied.statusCode).toBe(401);
    const forged = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://foreign.example", "x-csrf-token": "audit-bootstrap" },
      payload: { email, password },
    });
    expect(forged.statusCode).toBe(403);
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM audit_events WHERE actor_id = $1",
          [userId],
        )
      ).rows[0]!.count,
    ).toBe(before);
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "audit-bootstrap" },
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const rawToken = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'password_reset', $2, NOW() + interval '1 hour')",
      [userId, createHash("sha256").update(rawToken).digest("hex")],
    );
    const reset = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/password/reset",
        headers: { origin, "x-csrf-token": "audit-bootstrap" },
        payload: { token: rawToken, password: "next-password-456" },
      });
    const accepted = await reset();
    expect(accepted.statusCode).toBe(200);
    expect((await reset()).statusCode).toBe(401);
    const revoked = await db.query<{ request_id: string; metadata_redacted: unknown }>(
      "SELECT request_id, metadata_redacted FROM audit_events WHERE actor_id = $1 AND action = 'session.revoked' AND request_id = $2",
      [userId, accepted.headers["x-request-id"]],
    );
    expect(revoked.rows.length).toBeGreaterThan(0);
    expect(revoked.rows.every((row) => JSON.stringify(row.metadata_redacted) === "{}")).toBe(true);
  });
});
