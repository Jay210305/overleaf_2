import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T11 live slice: template detail contents and instantiate flow through
 * the session-authed API.
 */
describe("S05-T11 template detail and instantiate flow", () => {
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

  it("serves detail contents matching the catalogue manifest", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/templates/thesis-outline",
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(200);
    const detail = response.json<{
      id: string;
      version: string;
      mainPath: string;
      manifestHash: string;
      files: Array<{ path: string; sha256: string; sizeBytes: number }>;
      contents: Array<{ path: string; content: string }>;
    }>();
    expect(detail.id).toBe("thesis-outline");
    expect(detail.mainPath).toBe("main.tex");
    const byPath = new Map(detail.contents.map((file) => [file.path, file.content]));
    expect(byPath.get("main.tex")).toContain("\\documentclass{report}");
    for (const file of detail.files) {
      const content = byPath.get(file.path)!;
      expect(createHash("sha256").update(content, "utf8").digest("hex")).toBe(file.sha256);
    }
    const unknown = await app.inject({
      method: "GET",
      url: "/api/v1/templates/missing",
      headers: { origin, cookie },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("instantiates an independent project from the detail flow", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/templates/minimal-article/instantiate",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { title: "Detail flow project" },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<{ id: string; templateVersion: string; mainFileId: string }>();
    expect(created.templateVersion).toBe("1.0.0");
    const texts = await fixture.db.query<{ payload_bytes: Buffer }>(
      "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1",
      [created.mainFileId],
    );
    expect(texts.rows).toHaveLength(1);
    const members = await fixture.db.query("SELECT * FROM project_members WHERE project_id = $1", [
      created.id,
    ]);
    expect(members.rows).toHaveLength(0);
  });
});
