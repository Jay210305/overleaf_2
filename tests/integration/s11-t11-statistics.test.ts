import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S11-T11 academic project statistics", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let cookie: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const project = await createProject(fixture.db, owner.id, {
      title: "Academic statistics fixture",
      compiler: "pdflatex",
    });
    projectId = project.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    app = createServer({ checkReadiness: async () => true, db: fixture.db, origin, logger: false });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("returns numeric file bytes for a new project", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/statistics`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(200);
    const stored = await fixture.db.query<{ size_bytes: string }>(
      "SELECT size_bytes FROM project_nodes WHERE project_id = $1 AND name = 'main.tex'",
      [projectId],
    );
    const expectedBytes = Number(stored.rows[0]!.size_bytes);
    expect(response.json()).toMatchObject({
      fileCount: 1,
      sizeBytes: expectedBytes,
      approximateWords: Math.round(expectedBytes / 6),
    });
  });
});
