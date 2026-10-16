import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { RevisionsRepository } from "../../../packages/db/src/repositories/revisions.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildImportArchive, settleValidatedJob } from "../../helpers/import-apply.js";

loadEnvFile(".env");

/**
 * S05-T05 PRO-06 slice: authorized revision-ZIP download for editors, denied
 * for viewers and strangers, with byte-identical repeat downloads.
 */
describe("S05-T05 PRO-06 authorized export download", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let revisionNo: number;
  let cookie: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    const owner = await fixture.seed();
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
    const jobs = new ImportJobRepository(fixture.db);
    const settled = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      owner.id,
      `PRO-06 download ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    projectId = applied.projectId!;
    const revisions = new RevisionsRepository(fixture.db);
    const checkpoint = await revisions.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "manual",
      label: null,
    });
    revisionNo = checkpoint.revisionNo;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  function download(headers: Record<string, string> = {}) {
    return app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/export?revisionNo=${revisionNo}`,
      headers: { origin, cookie, ...headers },
    });
  }

  it("downloads the revision ZIP twice with identical bytes", async () => {
    const first = await download();
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("application/zip");
    expect(first.headers["content-disposition"]).toMatch(
      new RegExp(`attachment; filename="source-revision-${revisionNo}\\.zip"`),
    );
    expect(Buffer.from(first.rawPayload).subarray(0, 2).toString("binary")).toBe("PK");
    const second = await download();
    expect(Buffer.from(second.rawPayload)).toEqual(Buffer.from(first.rawPayload));
  });

  it("denies viewers, strangers and bad revisions", async () => {
    const viewer = await fixture.seed();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
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
    const stranger = await fixture.seed();
    const strangerLogin = await fixture.login(stranger.email);
    const strangerCookie = String(strangerLogin.headers["set-cookie"]).split(";")[0]!;
    const foreign = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/export?revisionNo=${revisionNo}`,
      headers: { origin, cookie: strangerCookie },
    });
    expect(foreign.statusCode).toBe(404);
    const malformed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/export?revisionNo=zero`,
      headers: { origin, cookie },
    });
    expect(malformed.statusCode).toBe(400);
  });
});
