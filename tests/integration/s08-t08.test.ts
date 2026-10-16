import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T08 sharing revocation and detached anchors", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let otherProjectId: string;
  let fileId: string;
  let owner: { id: string; email: string };
  let invited: { id: string; email: string };
  let stranger: { id: string; email: string };
  let viewer: { id: string; email: string };
  let doc: Y.Doc;
  const delivered: Array<{ email: string; token: string }> = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    for (const migration of ["0011-comment-context.sql", "0012-notification-idempotency.sql"])
      await fixture.db.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations", migration),
          "utf8",
        ),
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
    owner = await fixture.seed();
    invited = await fixture.seed();
    stranger = await fixture.seed();
    viewer = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    fileId = randomUUID();
    doc = new Y.Doc();
    doc.getText("content").insert(0, "Anchored revocation paragraph");
    for (const id of [projectId, otherProjectId]) {
      await fixture.db.query(
        "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Revocation verify')",
        [id, owner.id],
      );
    }
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, viewer.id],
    );
    await fixture.db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
      [fileId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 1, $2, $3)",
      [fileId, owner.id, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );
  });

  afterAll(async () => {
    doc?.destroy();
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

  async function invite(email: string, role = "EDITOR") {
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: await headers(owner.email),
      payload: { email, role },
    });
    expect(created.statusCode).toBe(201);
    return { id: created.json().id as string, token: delivered.at(-1)!.token };
  }

  function anchor(body = "verify me") {
    const text = doc.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 0)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 8)),
      selectedText: "Anchored",
      body,
      mentions: [],
    };
  }

  it("expires invitations with 410 and grants nothing", async () => {
    const { token } = await invite(invited.email);
    await fixture.db.query(
      "UPDATE project_invitations SET expires_at = NOW() - INTERVAL '1 hour' WHERE email_normalized = $1",
      [invited.email.toLowerCase()],
    );
    const expired = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: await headers(invited.email),
      payload: { token },
    });
    expect(expired.statusCode).toBe(410);
    const membership = await fixture.db.query("SELECT user_id FROM project_members WHERE project_id = $1 AND user_id = $2", [
      projectId,
      invited.id,
    ]);
    expect(membership.rows).toHaveLength(0);
  });

  it("revokes invitations with 404 and keeps them single-use", async () => {
    const first = await invite(invited.email);
    const revoked = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/invitations/${first.id}`,
      headers: await headers(owner.email),
    });
    expect(revoked.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: await headers(invited.email),
          payload: { token: first.token },
        })
      ).statusCode,
    ).toBe(404);
    const second = await invite(invited.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: await headers(stranger.email),
          payload: { token: second.token },
        })
      ).statusCode,
    ).toBe(404);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: await headers(invited.email),
      payload: { token: second.token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: await headers(invited.email),
          payload: { token: second.token },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("revokes, expires and exhausts share links", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), maxUses: 1 },
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.json().link)).not.toContain(created.json().token);
    const token = created.json().token as string;
    const linkId = created.json().link.id as string;
    const redeemer = await fixture.seed();
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: await headers(redeemer.email),
      payload: { token },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: await headers(stranger.email),
          payload: { token },
        })
      ).statusCode,
    ).toBe(410);
    const expiring = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    const expiringToken = expiring.json().token as string;
    const expiringId = expiring.json().link.id as string;
    expect(expiring.statusCode).toBe(201);
    await fixture.db.query("UPDATE share_links SET created_at = NOW() - INTERVAL '2 minutes', expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [
      expiringId,
    ]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: await headers(stranger.email),
          payload: { token: expiringToken },
        })
      ).statusCode,
    ).toBe(410);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${linkId}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: await headers(stranger.email),
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
    const grant = await fixture.db.query(
      "SELECT revoked_at FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, redeemer.id],
    );
    expect(grant.rows[0]?.revoked_at).not.toBeNull();
  });

  it("rejects wrong-project comments and viewer writes while reply and resolve pass", async () => {
    const ownerHeaders = await headers(owner.email);
    const viewerHeaders = await headers(viewer.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${otherProjectId}/comments`,
          headers: ownerHeaders,
          payload: anchor(),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments`,
          headers: viewerHeaders,
          payload: anchor(),
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(),
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;
    const reply = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments/${commentId}/replies`,
      headers: await headers(invited.email),
      payload: { body: "confirmed" },
    });
    expect(reply.statusCode).toBe(201);
    const resolved = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/comments/${commentId}`,
      headers: ownerHeaders,
      payload: { status: "resolved" },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().status).toBe("resolved");
    const reopened = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/comments/${commentId}`,
      headers: ownerHeaders,
      payload: { status: "open" },
    });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().status).toBe("open");
  });

  it("detaches a deleted range instead of moving it to unrelated text", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor("doomed range"),
    });
    expect(created.statusCode).toBe(201);
    doc.getText("content").delete(0, 8);
    const seq = await fixture.db.query<{ seq: string }>(
      "SELECT COALESCE(MAX(seq), 0)::text AS seq FROM crdt_updates WHERE file_id = $1",
      [fileId],
    );
    const next = Number(seq.rows[0]!.seq) + 1;
    await fixture.db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, $2, $3, $4)",
      [fileId, next, owner.id, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );
    await fixture.db.query(
      "UPDATE text_documents SET last_persisted_seq = $2 WHERE file_id = $1",
      [fileId, next],
    );
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.json().id,
          detached: true,
          detachedReason: "range_changed",
          start: null,
          end: null,
        }),
      ]),
    );
  });
});
