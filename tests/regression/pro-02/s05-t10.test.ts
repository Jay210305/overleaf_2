import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { validateZipArchive } from "../../../apps/jobs/src/imports/zip.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildZip, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

describe("S05-T10 PRO-02 ZIP project ownership", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  const keys: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 8);
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  });

  afterAll(async () => {
    for (const key of keys) await storage.delete(key);
    if (fixture) await fixture.close();
  });

  it("exposes a committed imported project only to its owner", async () => {
    const owner = await fixture.seed();
    const stranger = await fixture.seed();
    const ownerLogin = await fixture.login(owner.email);
    const strangerLogin = await fixture.login(stranger.email);
    const archive = buildZip([{ name: "main.tex", data: "\\documentclass{article}\n" }]);
    const jobs = new ImportJobRepository(fixture.db);
    const reserved = await jobs.reserve({
      actorId: owner.id,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(archive),
      archiveSize: archive.length,
      title: "Owned ZIP project",
    });
    const manifest = await validateZipArchive(archive);
    await fixture.db.query(
      "UPDATE import_jobs SET status = 'validated', manifest = $2::jsonb, manifest_version = 1 WHERE id = $1",
      [reserved.job.id, JSON.stringify(manifest)],
    );
    await storage.put(reserved.job.archiveKey, archive, "application/zip");
    keys.push(reserved.job.archiveKey);
    const done = await applyValidatedImport(fixture.db, storage, reserved.job.id);
    const ownerRead = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${done.projectId}`,
      headers: { origin, cookie: String(ownerLogin.headers["set-cookie"]).split(";")[0]! },
    });
    expect(ownerRead.statusCode).toBe(200);
    expect(ownerRead.json()).toMatchObject({ id: done.projectId, ownerId: owner.id });
    const strangerRead = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${done.projectId}`,
      headers: { origin, cookie: String(strangerLogin.headers["set-cookie"]).split(";")[0]! },
    });
    expect(strangerRead.statusCode).toBe(404);
  });
});
