import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { runImportApplyPass } from "../../../apps/jobs/src/imports/apply-project.js";
import { runImportValidationPass } from "../../../apps/jobs/src/imports/worker.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { settleValidatedJob } from "../../helpers/import-apply.js";
import { buildZip } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T10 PRO-10 slice: hostile archives never become projects. Traversal,
 * symlink and nested-ZIP inputs fail validation, and the apply pass leaves
 * failed jobs untouched with zero project rows.
 */
describe("S05-T10 PRO-10 hostile archives never become projects", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
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
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function settleHostile(title: string, bytes: Buffer): Promise<string> {
    const { createHash } = await import("node:crypto");
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: createHash("sha256").update(bytes).digest("hex"),
      archiveSize: bytes.length,
      title,
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: createHash("sha256").update(bytes).digest("hex"),
      archiveSize: bytes.length,
    });
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(reserved.job.id);
      if (current && (current.status === "failed" || current.status === "validated")) {
        return reserved.job.id;
      }
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    throw new Error("hostile job did not settle");
  }

  async function expectNoProject(title: string, jobId: string): Promise<void> {
    // Failed jobs are invisible to the apply pass; other suites sharing
    // local services may move their own jobs, so assert only OUR job.
    await runImportApplyPass(fixture.db, storage, { limit: 5 });
    const job = await jobs.get(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.projectId).toBeNull();
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(0);
  }

  it("quarantines a traversal archive", async () => {
    const title = `PRO-10 traversal ${randomUUID()}`;
    const jobId = await settleHostile(
      title,
      buildZip([{ name: "../evil.tex", data: "x" }]),
    );
    await expectNoProject(title, jobId);
  });

  it("quarantines a symlink archive", async () => {
    const title = `PRO-10 symlink ${randomUUID()}`;
    const jobId = await settleHostile(
      title,
      buildZip([{ name: "link.tex", data: "x", unixMode: 0o120000 }]),
    );
    await expectNoProject(title, jobId);
  });

  it("quarantines a nested ZIP archive", async () => {
    const title = `PRO-10 nested ${randomUUID()}`;
    const jobId = await settleHostile(
      title,
      buildZip([{ name: "inner.zip", data: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }]),
    );
    await expectNoProject(title, jobId);
  });

  it("still applies a valid archive after hostile ones", async () => {
    const title = `PRO-10 valid ${randomUUID()}`;
    const { job } = await settleValidatedJob(fixture.db, storage, jobs, actorId, title);
    expect(job.status).toBe("validated");
  });
});
