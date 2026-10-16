import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnvFile } from "node:process";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

describe("S11-T05 authorized figure bytes", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let sourceId: string;
  let cookie: string;
  let imageKey: string;
  let storage: S3StorageAdapter;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const project = await createProject(fixture.db, owner.id, {
      title: `S11 figure ${randomUUID()}`,
      compiler: "pdflatex",
    });
    projectId = project.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      storage,
      origin,
      logger: false,
    });
    const folderId = randomUUID();
    const source = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'main.tex' AND deleted_at IS NULL",
      [projectId],
    );
    sourceId = source.rows[0]!.id;
    const imageId = randomUUID();
    imageKey = `projects/${projectId}/blobs/${randomUUID()}`;
    await storage.put(imageKey, Buffer.from([137, 80, 78, 71]), "image/png");
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1,$3,NULL,'figures','FOLDER','application/octet-stream','BINARY',NULL),
              ($2,$3,$1,'chart.png','FILE','image/png','BINARY',$4)`,
      [folderId, imageId, projectId, imageKey],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    if (storage && imageKey) await storage.delete(imageKey);
    if (fixture) await fixture.close();
  });

  const get = (path: string, headers = { origin, cookie }) =>
    app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${sourceId}/figure?path=${encodeURIComponent(path)}`,
      headers,
    });

  it("returns a matching private image only to a current project member", async () => {
    const image = await get("figures/chart.png");
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload).toEqual(Buffer.from([137, 80, 78, 71]));
    expect((await get("figures/missing.png")).statusCode).toBe(404);
    expect((await get("../figures/chart.png")).statusCode).toBe(400);
    expect((await get("figures/chart.png", { origin, cookie: "" })).statusCode).toBe(401);
  });

  it("does not expose another project's source or a revoked member's image", async () => {
    const stranger = await fixture.seed();
    const foreign = await createProject(fixture.db, stranger.id, {
      title: `Foreign figure ${randomUUID()}`,
      compiler: "pdflatex",
    });
    const foreignRead = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${foreign.id}/files/${foreign.mainFileId}/figure?path=figures%2Fchart.png`,
      headers: { origin, cookie },
    });
    expect(foreignRead.statusCode).toBe(404);

    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, stranger.id],
    );
    const login = await fixture.login(stranger.email);
    const viewerCookie = String(login.headers["set-cookie"]).split(";")[0]!;
    expect((await get("figures/chart.png", { origin, cookie: viewerCookie })).statusCode).toBe(200);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, stranger.id],
    );
    expect((await get("figures/chart.png", { origin, cookie: viewerCookie })).statusCode).toBe(404);
  });
});
