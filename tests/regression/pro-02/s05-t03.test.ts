import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { parseServerConfig } from "@latex-collab/config/server";
import { runImportValidationPass } from "../../../apps/jobs/src/imports/worker.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { buildZip, minimalPng, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * PRO-02 slice: creating from ZIP persists one durable idempotent job and a
 * versioned manifest. Applying it to project state stays owned by S05-T10.
 */
describe("S05-T03 PRO-02 import job staging", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../../packages/db/migrations/0006-import-jobs.sql"),
        "utf8",
      ),
    );
    actorId = (await fixture.seed()).id;
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

  it("stages exactly one job for repeated intake retries", async () => {
    const bytes = buildZip([
      { name: "main.tex", data: "\\documentclass{article}\n\\begin{document}X\\end{document}\n" },
      { name: "assets/fig.png", data: minimalPng() },
    ]);
    const key = randomUUID();
    const input = {
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title: "Blank-derived import",
    };
    const first = await jobs.reserve(input);
    await storage.put(first.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(first.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    const retry = await jobs.reserve(input);
    expect(retry.created).toBe(false);
    expect(retry.job.id).toBe(first.job.id);
    expect(["queued", "validating", "validated"]).toContain(retry.job.status);
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(first.job.id);
      if (current?.status === "validated") break;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    const done = await jobs.get(first.job.id);
    expect(done?.status).toBe("validated");
    expect(done?.manifestVersion).toBe(1);
    expect(done?.projectId).toBeNull();
    const again = await jobs.reserve(input);
    expect(again.job.id).toBe(first.job.id);
    expect(again.job.status).toBe("validated");
  });

  it("keeps a failed job addressable so a new key is required to retry", async () => {
    const bytes = buildZip([{ name: "nested.zip", data: Buffer.from([0x50, 0x4b, 3, 4]) }]);
    const key = randomUUID();
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title: "Rejected import",
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(reserved.job.id);
      if (current?.status === "failed") break;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    const same = await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title: "Rejected import",
    });
    expect(same.created).toBe(false);
    expect(same.job.status).toBe("failed");
  });
});
