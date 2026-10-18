import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S13-T05: Import editable individual references", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let ownerUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let project: { id: string };
  let zoteroConnId: string;
  let expiredConnId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();
    viewerUser = await fixture.seed();

    // Create project owned by ownerUser
    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('Reference Import Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    // Add viewerUser as VIEWER
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'VIEWER')`,
      [project.id, viewerUser.id],
    );

    // Seed active Zotero connection for owner
    const connRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'zotero', 'enc:v1:01:02:03', '["read"]', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    zoteroConnId = connRes.rows[0]!.id;

    // Seed expired connection
    const expRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'zotero', 'enc:v1:01:02:03', '["read"]', 'expired')
       RETURNING id`,
      [ownerUser.id],
    );
    expiredConnId = expRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const res = await fixture.login(email);
    expect(res.statusCode).toBe(200);
    return {
      cookie: String(res.headers["set-cookie"]).split(";")[0]!,
      csrf: String(res.headers["x-csrf-token"]),
    };
  }

  it("imports individual references into references.bib preserving raw source (INT-08)", async () => {
    const session = await getSession(ownerUser.email);
    const rawEntry = `@article{einstein1905,\n  author = {Albert Einstein},\n  title = {Zur Elektrodynamik bewegter K\\"{o}rper},\n  year = {1905}\n}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "zotero",
        connectionId: zoteroConnId,
        entries: [
          {
            key: "einstein1905",
            rawSource: rawEntry,
          },
        ],
        normalize: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.importedCount).toBe(1);
    expect(body.keys).toEqual(["einstein1905"]);
    expect(body.duplicates).toEqual([]);
    expect(body.newContent).toContain(rawEntry);
  });

  it("detects duplicate citation keys when importing already present entries (INT-01)", async () => {
    const session = await getSession(ownerUser.email);
    const rawEntry = `@article{einstein1905,\n  author = {Albert Einstein},\n  title = {Zur Elektrodynamik},\n  year = {1905}\n}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "crossref",
        entries: [
          {
            key: "einstein1905",
            rawSource: rawEntry,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.duplicates).toContain("einstein1905");
  });

  it("applies safe normalization when normalize=true is requested", async () => {
    const session = await getSession(ownerUser.email);
    const rawEntry = `@article{feynman1965,\n  author = {Richard Feynman},\n  title = {Quantum Electrodynamics},\n  year = {1965}\n}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "crossref",
        entries: [
          {
            key: "feynman1965",
            rawSource: rawEntry,
          },
        ],
        normalize: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.keys).toContain("feynman1965");
  });

  it("rejects import with CAPABILITY_UNSUPPORTED when provider does not support individual reference import", async () => {
    const session = await getSession(ownerUser.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "dropbox",
        entries: [
          {
            key: "testkey",
            rawSource: "@article{testkey, title={Test}}",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe("CAPABILITY_UNSUPPORTED");
  });

  it("rejects unpermitted providers (Mendeley/Papers) with CAPABILITY_UNSUPPORTED (INT-04)", async () => {
    const session = await getSession(ownerUser.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "mendeley",
        entries: [
          {
            key: "mendeleyKey",
            rawSource: "@article{mendeleyKey, title={Mendeley paper}}",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe("CAPABILITY_UNSUPPORTED");
    expect(body.detail).toContain("BLOCKED_BY_PROVIDER");
  });

  it("rejects import with TOKEN_EXPIRED when connection credential is expired (INT-03)", async () => {
    const session = await getSession(ownerUser.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "zotero",
        connectionId: expiredConnId,
        entries: [
          {
            key: "key1",
            rawSource: "@article{key1, title={Sample}}",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("TOKEN_EXPIRED");
  });

  it("enforces server-side authorization: viewer cannot import references (403)", async () => {
    const session = await getSession(viewerUser.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/references/import`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        provider: "zotero",
        entries: [
          {
            key: "key2",
            rawSource: "@article{key2, title={Sample}}",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("PROJECT_PERMISSION_DENIED");
  });
});
