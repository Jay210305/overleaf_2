import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T06 live route slice: catalogue listing/filtering and member-free
 * instantiation against real PostgreSQL through the session-authed API.
 */
describe("S05-T06 template catalogue and instantiation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  function get(url: string, headers: Record<string, string> = {}) {
    return app.inject({ method: "GET", url, headers: { origin, cookie, ...headers } });
  }

  function post(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return app.inject({
      method: "POST",
      url,
      headers: { origin, cookie, "x-csrf-token": csrf, ...headers },
      payload: body,
    });
  }

  it("lists two versioned templates with file manifests", async () => {
    const response = await get("/api/v1/templates");
    expect(response.statusCode).toBe(200);
    const listed = response.json<{ templates: Array<{ id: string; version: string; manifestHash: string; files: unknown[] }> }>().templates;
    expect(listed.map((template) => template.id).sort()).toEqual(["minimal-article", "thesis-outline"]);
    for (const template of listed) {
      expect(template.version).toBe("1.0.0");
      expect(template.manifestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(template.files.length).toBeGreaterThan(0);
    }
  });

  it("filters the catalogue by category", async () => {
    const response = await get("/api/v1/templates?category=thesis");
    expect(response.statusCode).toBe(200);
    const listed = response.json<{ templates: Array<{ id: string }> }>().templates;
    expect(listed.map((template) => template.id)).toEqual(["thesis-outline"]);
    const empty = await get("/api/v1/templates?category=poster");
    expect(empty.json<{ templates: unknown[] }>().templates).toEqual([]);
  });

  it("instantiates an editable member-free project", async () => {
    const title = `Templated ${randomUUID()}`;
    const response = await post("/api/v1/templates/thesis-outline/instantiate", { title });
    expect(response.statusCode).toBe(201);
    const created = response.json<{
      id: string;
      title: string;
      templateId: string;
      templateVersion: string;
      mainFileId: string;
    }>();
    expect(created.templateId).toBe("thesis-outline");
    expect(created.templateVersion).toBe("1.0.0");
    const nodes = await fixture.db.query<{ name: string; kind: string }>(
      "SELECT name, kind FROM project_nodes WHERE project_id = $1",
      [created.id],
    );
    expect(nodes.rows.map((row) => row.name).sort()).toEqual([
      "chapters",
      "intro.tex",
      "main.tex",
      "refs.bib",
    ]);
    const updates = await fixture.db.query<{ payload_bytes: Buffer }>(
      "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
      [created.mainFileId],
    );
    expect(updates.rows).toHaveLength(1);
    const doc = new Y.Doc();
    for (const row of updates.rows) Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
    const text = doc.getText("content").toString();
    doc.destroy();
    expect(text).toContain("\\documentclass{report}");
    const members = await fixture.db.query("SELECT user_id FROM project_members WHERE project_id = $1", [
      created.id,
    ]);
    expect(members.rows).toHaveLength(0);
  });

  it("denies unknown templates, bad titles and missing sessions", async () => {
    const unknown = await post("/api/v1/templates/nonexistent/instantiate", { title: "x" });
    expect(unknown.statusCode).toBe(404);
    const badTitle = await post("/api/v1/templates/minimal-article/instantiate", { title: "  " });
    expect(badTitle.statusCode).toBe(400);
    const noSession = await app.inject({
      method: "GET",
      url: "/api/v1/templates",
      headers: { origin },
    });
    expect(noSession.statusCode).toBe(401);
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = '  '");
    expect(projects.rows).toHaveLength(0);
  });
});
