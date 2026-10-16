import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import {
  buildImportArchive,
  settleValidatedJob,
} from "../../helpers/import-apply.js";
import { minimalPng } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T05 PRO-05 slice: permitted binaries preview through authorized
 * resources; anything outside the inline image/PDF set downloads inertly.
 */
describe("S05-T05 PRO-05 permitted binary preview", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let pngNodeId: string;
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
      `PRO-05 preview ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    projectId = applied.projectId!;
    pngNodeId = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'fig.png'",
        [projectId],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("serves the permitted image with exact bytes and no key material", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${pngNodeId}/download`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(response.rawPayload)).toEqual(minimalPng());
    expect(JSON.stringify(response.headers)).not.toContain("projects/");
    expect(JSON.stringify(response.headers)).not.toContain("Expires=");
  });

  it("rejects text nodes as downloadable binaries", async () => {
    const mainId = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'main.tex'",
        [projectId],
      )
    ).rows[0]!.id;
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${mainId}/download`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
