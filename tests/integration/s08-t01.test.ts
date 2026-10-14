import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { createServer } from "../../apps/api/src/server.js";
import { createSmtpProjectInvitationSender } from "../../apps/api/src/modules/auth/mail.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T01 project email invitations", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let owner: { id: string; email: string };
  let recipient: { id: string; email: string };
  const delivered: Array<{ email: string; token: string }> = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0009-project-invitations.sql"),
        "utf8",
      ),
    );
    owner = await fixture.seed();
    recipient = await fixture.seed();
    projectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Invitation test')",
      [projectId, owner.id],
    );
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      sendProjectInvitation: async (email, token) => {
        delivered.push({ email, token });
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  async function headers(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  it("sends a hashed project invitation and accepts it for the matching account exactly once", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: ownerHeaders,
      payload: { email: `  ${recipient.email.toUpperCase()}  `, role: "EDITOR" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      projectId,
      email: recipient.email,
      role: "EDITOR",
      status: "pending",
    });
    expect(created.body).not.toContain("token");
    expect(delivered.at(-1)?.email).toBe(recipient.email);
    const token = delivered.at(-1)!.token;
    const persisted = await fixture.db.query<{ token_hash: string; delivered_at: Date | null }>(
      "SELECT token_hash, delivered_at FROM project_invitations WHERE id = $1",
      [created.json().id],
    );
    expect(persisted.rows[0]?.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(persisted.rows[0]?.delivered_at).not.toBeNull();

    const recipientHeaders = await headers(recipient.email);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: recipientHeaders,
      payload: { token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ projectId, role: "EDITOR" });
    expect(
      (
        await fixture.db.query<{ role: string; revoked_at: Date | null }>(
          "SELECT role, revoked_at FROM project_members WHERE project_id = $1 AND user_id = $2",
          [projectId, recipient.id],
        )
      ).rows,
    ).toEqual([{ role: "EDITOR", revoked_at: null }]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("delivers an invitation through local Mailpit with the secret in a URL fragment", async () => {
    const mailRecipient = await fixture.seed();
    const smtpApp = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      sendProjectInvitation: createSmtpProjectInvitationSender(
        "smtp://127.0.0.1:51025",
        "invitation@example.test",
        origin,
      ),
    });
    try {
      const created = await smtpApp.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/invitations`,
        headers: await headers(owner.email),
        payload: { email: mailRecipient.email, role: "VIEWER" },
      });
      expect(created.statusCode).toBe(201);
      const mailpit = parseServerConfig(process.env).MAILPIT_URL;
      const listing = (await (await fetch(`${mailpit}/api/v1/messages`)).json()) as {
        messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
      };
      const message = listing.messages.find((item) =>
        item.To.some((to) => to.Address === mailRecipient.email),
      );
      expect(message?.Subject).toBe("Join a LaTeX Workspace project");
      const detail = (await (await fetch(`${mailpit}/api/v1/message/${message!.ID}`)).json()) as {
        Text: string;
      };
      const token = detail.Text.match(/\/invitations#token=([A-Za-z0-9_-]{43})/)?.[1];
      expect(token).toBeTruthy();
      const stored = await fixture.db.query<{ token_hash: string }>(
        "SELECT token_hash FROM project_invitations WHERE id = $1",
        [created.json().id],
      );
      expect(stored.rows[0]?.token_hash).toBe(createHash("sha256").update(token!).digest("hex"));
      const accepted = await smtpApp.inject({
        method: "POST",
        url: "/api/v1/invitations/accept",
        headers: await headers(mailRecipient.email),
        payload: { token },
      });
      expect(accepted.statusCode).toBe(200);
    } finally {
      await smtpApp.close();
    }
  });

  it("keeps a failed mail delivery unusable", async () => {
    const unreachable = await fixture.seed();
    const failingApp = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      sendProjectInvitation: async () => {
        throw new Error("SMTP unavailable");
      },
    });
    try {
      const result = await failingApp.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/invitations`,
        headers: await headers(owner.email),
        payload: { email: unreachable.email, role: "REVIEWER" },
      });
      expect(result.statusCode).toBe(503);
      const rows = await fixture.db.query<{ delivered_at: Date | null; revoked_at: Date | null }>(
        "SELECT delivered_at, revoked_at FROM project_invitations WHERE project_id = $1 AND email_normalized = $2",
        [projectId, unreachable.email],
      );
      expect(rows.rows[0]?.delivered_at).toBeNull();
      expect(rows.rows[0]?.revoked_at).not.toBeNull();
    } finally {
      await failingApp.close();
    }
  });

  it("pages owner-visible invitations without returning token hashes", async () => {
    const firstRecipient = await fixture.seed();
    const secondRecipient = await fixture.seed();
    const ownerHeaders = await headers(owner.email);
    for (const email of [firstRecipient.email, secondRecipient.email]) {
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/invitations`,
        headers: ownerHeaders,
        payload: { email, role: "VIEWER" },
      });
      expect(created.statusCode).toBe(201);
    }
    const first = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/invitations?limit=1`,
      headers: ownerHeaders,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().items).toHaveLength(1);
    expect(first.json().nextCursor).toBeTypeOf("string");
    expect(first.body).not.toContain("token_hash");
    const second = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/invitations?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: ownerHeaders,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().items).toHaveLength(1);
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id);
  });
});
