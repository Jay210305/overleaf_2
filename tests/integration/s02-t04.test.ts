import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S02-T04 project boundary against PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let foreignId: string;
  let owner: Awaited<ReturnType<typeof fixture.seed>>;
  let editor: Awaited<ReturnType<typeof fixture.seed>>;
  let viewer: Awaited<ReturnType<typeof fixture.seed>>;
  let outsider: Awaited<ReturnType<typeof fixture.seed>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();
    const project = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, $2) RETURNING id",
      [owner.id, `Private ${randomUUID()}`],
    );
    projectId = project.rows[0]!.id;
    const foreign = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, 'Foreign secret') RETURNING id",
      [outsider.id],
    );
    foreignId = foreign.rows[0]!.id;
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR'), ($1, $3, 'VIEWER')",
      [projectId, editor.id, viewer.id],
    );
    fixture.app.get(
      "/api/v1/projects/:projectId/guard-probe",
      { config: { projectAction: "READ" } },
      async (request) => {
        const { projectId: id } = request.params as { projectId: string };
        const result = await fixture.db.query<{ title: string }>(
          "SELECT title FROM projects WHERE id = $1",
          [id],
        );
        return { title: result.rows[0]?.title };
      },
    );
    fixture.app.post(
      "/api/v1/projects/:projectId/guard-probe",
      { config: { projectAction: "EDIT" } },
      async () => ({ accepted: true }),
    );
    fixture.app.get("/api/v1/projects/:projectId/unsupported-probe", async () => ({
      leaked: true,
    }));
  });
  afterAll(async () => fixture.close());

  async function cookie(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("allows only current members to read project content", async () => {
    const ownerSession = await cookie(owner.email);
    const viewerSession = await cookie(viewer.email);
    const outsiderSession = await cookie(outsider.email);
    const url = `/api/v1/projects/${projectId}/guard-probe`;
    const ownerRead = await fixture.app.inject({
      method: "GET",
      url,
      headers: { origin, cookie: ownerSession.cookie },
    });
    expect(ownerRead.statusCode).toBe(200);
    expect(ownerRead.json().title).toMatch(/^Private /);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin, cookie: viewerSession.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const denied = await fixture.app.inject({
      method: "GET",
      url,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.body).not.toContain("Private");
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: `/api/v1/projects/${foreignId}/guard-probe`,
          headers: { origin, cookie: ownerSession.cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("requires a live session, exact Origin and matching CSRF for project mutations", async () => {
    const session = await cookie(editor.email);
    const url = `/api/v1/projects/${projectId}/guard-probe`;
    expect((await fixture.app.inject({ method: "GET", url, headers: { origin } })).statusCode).toBe(
      401,
    );
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin: "https://foreign.example", cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url,
          headers: { origin, cookie: session.cookie, "x-csrf-token": "forged-secret" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url,
          headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        })
      ).statusCode,
    ).toBe(200);
    await fixture.db.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1", [
      editor.id,
    ]);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin, cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("denies unsupported actions, invalid IDs and stale membership", async () => {
    const viewerSession = await cookie(viewer.email);
    const url = `/api/v1/projects/${projectId}/guard-probe`;
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url,
          headers: { origin, cookie: viewerSession.cookie, "x-csrf-token": viewerSession.csrf },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}/unsupported-probe`,
          headers: { origin, cookie: viewerSession.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/projects/not-a-uuid/guard-probe",
          headers: { origin, cookie: viewerSession.cookie },
        })
      ).statusCode,
    ).toBe(400);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, viewer.id],
    );
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin, cookie: viewerSession.cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("rejects a disabled account and an expired session after login", async () => {
    const disabled = await fixture.seed();
    const expired = await fixture.seed();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER'), ($1, $3, 'REVIEWER')",
      [projectId, disabled.id, expired.id],
    );
    const disabledSession = await cookie(disabled.email);
    const expiredSession = await cookie(expired.email);
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [disabled.id]);
    await fixture.db.query(
      "UPDATE sessions SET expires_at = NOW() - interval '1 second' WHERE user_id = $1",
      [expired.id],
    );
    const url = `/api/v1/projects/${projectId}/guard-probe`;
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin, cookie: disabledSession.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url,
          headers: { origin, cookie: expiredSession.cookie },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("keeps the public development sample restricted to its fixture project", async () => {
    const privateProject = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title, created_at) VALUES ($1, 'Private manuscript', '1900-01-01') RETURNING id",
      [owner.id],
    );
    const id = privateProject.rows[0]!.id;
    try {
      const response = await fixture.app.inject({
        method: "GET",
        url: "/api/v1/development/sample",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().project.id).not.toBe(id);
      expect(response.json().project.title).toBe("Persisted Development Project");
      expect(response.body).not.toContain("Private manuscript");
    } finally {
      await fixture.db.query("DELETE FROM projects WHERE id = $1", [id]);
    }
  });
});
