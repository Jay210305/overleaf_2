import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { createServer } from "../../apps/api/src/server.js";
import type { SendPasswordReset } from "../../apps/api/src/modules/auth/password-reset.js";
import type { TicketStore } from "../../apps/api/src/modules/collab/ticket.js";

loadEnvFile(".env");
export const origin = "http://127.0.0.1:5173";

export async function createSessionFixture(
  customOrigin = origin,
  secureCookies = false,
  sendPasswordReset?: SendPasswordReset,
  ticketStore?: TicketStore,
) {
  process.env.INTEGRATION_CREDENTIAL_KEY ??= randomUUID();
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
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(80814)");
    const frozen = await tx.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'revision_items' AND column_name = 'text_bytes') AS exists`,
    );
    if (frozen.rows[0]?.exists) return;
    await tx.query(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../../packages/db/migrations/0014-frozen-revision-content.sql",
        ),
        "utf8",
      ),
    );
  });
  // This helper runs in many parallel Vitest workers. Replaying ALTER/VIEW DDL
  // on every fixture can invalidate queries in another worker mid-request.
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(80802)");
    const installed = await tx.query<{ name: string | null }>(
      "SELECT to_regclass('public.active_project_members')::text AS name",
    );
    if (installed.rows[0]?.name) return;
    for (const migration of ["0009-project-invitations.sql", "0010-share-link-grants.sql"]) {
      await tx.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations", migration),
          "utf8",
        ),
      );
    }
  });
  const app = createServer({
    checkReadiness: async () => true,
    db,
    origin: customOrigin,
    secureCookies,
    logger: false,
    sendPasswordReset,
    ticketStore,
    profileResolver: async (_provider, code) => {
      const [prefix, providerSubject, email, displayName] = code.split(":");
      if (prefix !== "mock" || !providerSubject || !email) {
        throw new Error("Invalid test OAuth code");
      }
      return { providerSubject, email, ...(displayName ? { displayName } : {}) };
    },
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
