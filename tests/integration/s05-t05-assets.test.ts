import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../packages/db/src/repositories/import-jobs.js";
import { RevisionsRepository } from "../../packages/db/src/repositories/revisions.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { applyValidatedImport } from "../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyImportMigrations } from "../helpers/import-migrations.js";
import {
  buildImportArchive,
  settleValidatedJob,
} from "../helpers/import-apply.js";
import { minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T05 live route slice: authorized binary download and revision export
 * against real PostgreSQL/MinIO through the session-authed API.
 */
describe("S05-T05 authorized binary download and export", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let revisions: RevisionsRepository;
  let actorId: string;
  let cookie: string;
  let projectId: string;
  let pngNodeId: string;
  let fontNodeId: string;
  let legacyHtmlNodeId: string;
  let revisionNo: number;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    const owner = await fixture.seed();
    actorId = owner.id;
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
    jobs = new ImportJobRepository(fixture.db);
    revisions = new RevisionsRepository(fixture.db);
    const settled = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      actorId,
      `S05-T05 project ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    projectId = applied.projectId!;
    const pngRow = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'fig.png'",
        [projectId],
      )
    ).rows[0]!;
    pngNodeId = pngRow.id;
    const checkpoint = await revisions.createStructuralRevision({
      projectId,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    revisionNo = checkpoint.revisionNo;
    // A permitted font binary plus a legacy active-content row the upload
    // policy would never create today.
    fontNodeId = randomUUID();
    const fontBytes = Buffer.from([0, 1, 0, 0, 0, 0, 0, 0]);
    await storage.put(`projects/${projectId}/blobs/${sha256Hex(fontBytes)}`, fontBytes, "font/ttf");
    await fixture.db.query(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, 'face.ttf', 'FILE', 'font/ttf', 'BINARY', $3, $4)`,
      [fontNodeId, projectId, fontBytes.length, `projects/${projectId}/blobs/${sha256Hex(fontBytes)}`],
    );
    legacyHtmlNodeId = randomUUID();
    const htmlBytes = Buffer.from("<script>alert(1)</script>", "utf8");
    await storage.put(
      `projects/${projectId}/blobs/${sha256Hex(htmlBytes)}`,
      htmlBytes,
      "application/octet-stream",
    );
    await fixture.db.query(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, 'legacy.html', 'FILE', 'text/html', 'BINARY', $3, $4)`,
      [
        legacyHtmlNodeId,
        projectId,
        htmlBytes.length,
        `projects/${projectId}/blobs/${sha256Hex(htmlBytes)}`,
      ],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  function get(url: string, headers: Record<string, string> = {}) {
    return app.inject({ method: "GET", url, headers: { origin, cookie, ...headers } });
  }

  it("serves permitted images inline from authorized storage", async () => {
    const response = await get(`/api/v1/projects/${projectId}/files/${pngNodeId}/download`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-disposition"]).toMatch(/inline/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(response.rawPayload)).toEqual(minimalPng());
  });

  it("serves active and non-previewable binaries as attachment octet-stream", async () => {
    for (const nodeId of [legacyHtmlNodeId, fontNodeId]) {
      const response = await get(`/api/v1/projects/${projectId}/files/${nodeId}/download`);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/octet-stream");
      expect(response.headers["content-disposition"]).toMatch(/attachment/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("denies foreign nodes, text nodes and bad sessions without key leakage", async () => {
    const stranger = await fixture.seed();
    const strangerLogin = await fixture.login(stranger.email);
    const strangerCookie = String(strangerLogin.headers["set-cookie"]).split(";")[0]!;
    const foreign = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${pngNodeId}/download`,
      headers: { origin, cookie: strangerCookie },
    });
    expect(foreign.statusCode).toBe(404);
    const mainRow = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'main.tex'",
        [projectId],
      )
    ).rows[0]!;
    const text = await get(`/api/v1/projects/${projectId}/files/${mainRow.id}/download`);
    expect(text.statusCode).toBe(404);
    const noSession = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${pngNodeId}/download`,
      headers: { origin },
    });
    expect(noSession.statusCode).toBe(401);
    for (const body of [foreign.body, text.body, noSession.body]) {
      expect(String(body)).not.toContain("projects/");
      expect(String(body)).not.toContain("blobs/");
    }
  });

  it("exports the frozen revision ZIP for editors but not viewers", async () => {
    const ownerExport = await get(`/api/v1/projects/${projectId}/export?revisionNo=${revisionNo}`);
    expect(ownerExport.statusCode).toBe(200);
    expect(ownerExport.headers["content-type"]).toBe("application/zip");
    expect(ownerExport.headers["content-disposition"]).toMatch(/attachment/);
    expect((ownerExport.body as string).length).toBeGreaterThan(0);
    const viewer = await fixture.seed();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, viewer.id],
    );
    const viewerLogin = await fixture.login(viewer.email);
    const viewerCookie = String(viewerLogin.headers["set-cookie"]).split(";")[0]!;
    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/export?revisionNo=${revisionNo}`,
      headers: { origin, cookie: viewerCookie },
    });
    expect(denied.statusCode).toBe(403);
    const badRevision = await get(`/api/v1/projects/${projectId}/export?revisionNo=999999`);
    expect(badRevision.statusCode).toBe(404);
  });
});
