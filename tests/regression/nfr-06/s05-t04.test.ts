import { createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { RevisionsRepository } from "../../../packages/db/src/repositories/revisions.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { buildSourceZip } from "@latex-collab/storage/source-export";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildImportArchive, settleValidatedJob } from "../../helpers/import-apply.js";

loadEnvFile(".env");

/**
 * S05-T04 NFR-06 slice: one frozen revision always exports one identical
 * byte stream, and the export manifest hash recomputes exactly.
 */
describe("S05-T04 NFR-06 export hashes match exactly", () => {
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

  it("reproduces identical bytes and a verifiable manifest hash", async () => {
    const settled = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      actorId,
      `NFR-06 source ${randomUUID()}`,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    const checkpoint = await revisions.createStructuralRevision({
      projectId: applied.projectId!,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    const input = { projectId: applied.projectId!, actorId, revisionNo: checkpoint.revisionNo };
    const first = await buildSourceZip(fixture.db, storage, input);
    const second = await buildSourceZip(fixture.db, storage, input);
    expect(second.bytes).toEqual(first.bytes);
    expect(createHash("sha256").update(second.bytes).digest("hex")).toBe(
      createHash("sha256").update(first.bytes).digest("hex"),
    );
    const recomputed = createHash("sha256")
      .update(JSON.stringify(first.files.map((file) => [file.path, file.sha256, file.sizeBytes])))
      .digest("hex");
    expect(first.manifestHash).toBe(recomputed);
  });
});
