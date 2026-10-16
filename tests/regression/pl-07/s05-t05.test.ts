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
import { sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T05 PL-07 slice: the trust boundary holds — no private credentials or
 * object keys leak, active content never serves executable, and nosniff is
 * always present.
 */
describe("S05-T05 PL-07 download trust boundary", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let htmlNodeId: string;
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
      `PL-07 boundary ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    projectId = applied.projectId!;
    htmlNodeId = randomUUID();
    const htmlBytes = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    await storage.put(
      `projects/${projectId}/blobs/${sha256Hex(htmlBytes)}`,
      htmlBytes,
      "application/octet-stream",
    );
    await fixture.db.query(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, 'x.html', 'FILE', 'text/html', 'BINARY', $3, $4)`,
      [
        htmlNodeId,
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

  it("serves legacy active content inert with no private material", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${htmlNodeId}/download`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).not.toContain("html");
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-disposition"]).toMatch(/^attachment/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    const searchable = `${JSON.stringify(response.headers)} ${response.body as string}`;
    expect(searchable).not.toContain("blobs/");
    expect(searchable).not.toContain("AKIA");
    expect(searchable).not.toContain("SECRET");
  });

  it("keeps export denials free of project internals", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/export?revisionNo=424242`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body as string).not.toContain("blobs/");
    expect(response.body as string).not.toContain(projectId);
  });
});
