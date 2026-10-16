import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { RevisionsRepository } from "../../../packages/db/src/repositories/revisions.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { buildSourceZip } from "../../../apps/jobs/src/exports/zip.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import {
  buildImportArchive,
  settleValidatedJob,
} from "../../helpers/import-apply.js";
import { sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T04 PRO-06 slice: an authorized source-ZIP export feeds a fresh import
 * whose re-export carries identical file hashes.
 */
describe("S05-T04 PRO-06 export survives an import round trip", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let revisions: RevisionsRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    const owner = await fixture.seed();
    actorId = owner.id;
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    jobs = new ImportJobRepository(fixture.db);
    revisions = new RevisionsRepository(fixture.db);
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("re-exports identical file hashes after an import round trip", async () => {
    const first = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      actorId,
      `PRO-06 source ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, first.job.id);
    const checkpoint = await revisions.createStructuralRevision({
      projectId: applied.projectId!,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    const exported = await buildSourceZip(fixture.db, storage, {
      projectId: applied.projectId!,
      actorId,
      revisionNo: checkpoint.revisionNo,
    });
    const reimported = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(exported.bytes),
      archiveSize: exported.bytes.length,
      title: `PRO-06 reimport ${randomUUID()}`,
    });
    await storage.put(reimported.job.archiveKey, exported.bytes, "application/zip");
    const queued = await jobs.enqueue(reimported.job.id, {
      archiveSha256: sha256Hex(exported.bytes),
      archiveSize: exported.bytes.length,
    });
    expect(queued.status).toBe("queued");
    const { runImportValidationPass } = await import("../../../apps/jobs/src/imports/worker.js");
    let validated = await jobs.get(queued.id);
    for (let attempt = 0; attempt < 25 && validated?.status !== "validated"; attempt++) {
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
      validated = await jobs.get(queued.id);
    }
    expect(validated?.status).toBe("validated");
    const reapplied = await applyValidatedImport(fixture.db, storage, queued.id);
    const recheckpoint = await revisions.createStructuralRevision({
      projectId: reapplied.projectId!,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    const reexported = await buildSourceZip(fixture.db, storage, {
      projectId: reapplied.projectId!,
      actorId,
      revisionNo: recheckpoint.revisionNo,
    });
    const before = new Map(exported.files.map((file) => [file.path, file.sha256]));
    const after = new Map(reexported.files.map((file) => [file.path, file.sha256]));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, hash] of before) {
      expect(after.get(path)).toBe(hash);
    }
  });
});
