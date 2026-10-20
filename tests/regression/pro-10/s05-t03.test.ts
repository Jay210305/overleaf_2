import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { parseServerConfig } from "@latex-collab/config/server";
import { runImportValidationPass } from "../../../apps/jobs/src/imports/worker.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildZip, sha256Hex, type ZipFixtureEntry } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * PRO-10 slice: hostile archives never become projects. Every case below
 * must end in a failed job with a redacted error code and swept bytes.
 */
describe("S05-T03 PRO-10 hostile archives", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db);
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

  async function runCase(entries: ZipFixtureEntry[]) {
    const bytes = buildZip(entries);
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title: "Hostile import",
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    // Sibling S05-T03 workers share local services and may move any queued
    // job; wait for OUR job's terminal state instead of counting one pass.
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(reserved.job.id);
      if (current && (current.status === "validated" || current.status === "failed")) {
        expect(current.status).toBe("failed");
        expect(current.projectId).toBeNull();
        expect(current.manifest).toBeNull();
        return current;
      }
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    throw new Error("hostile import job did not settle");
  }

  it("rejects traversal, encoded traversal, absolute and backslash paths", async () => {
    for (const name of [
      "../../evil.tex",
      "a/../../../evil.tex",
      "%2e%2e/evil.tex",
      "..%2f/evil.tex",
      "/absolute.tex",
      "C:/drive.tex",
      "back\\slash.tex",
      "empty//segment.tex",
      "dot/./segment.tex",
      "nul\0byte.tex",
    ]) {
      const job = await runCase([{ name, data: "x\n" }]);
      expect(job.errorCode).toBe("UNSAFE_PATH");
    }
  });

  it("rejects duplicate normalized paths", async () => {
    const job = await runCase([
      { name: "docs/a.tex", data: "one\n" },
      { name: "docs/a.tex", data: "two\n" },
    ]);
    expect(job.errorCode).toBe("UNSAFE_PATH");
  });

  it("rejects symlinks, encrypted entries and unsupported methods", async () => {
    const symlink = await runCase([{ name: "link.tex", data: "main\n", unixMode: 0o120777 }]);
    expect(symlink.errorCode).toBe("INVALID_ARCHIVE");
    const encrypted = await runCase([
      { name: "secret.tex", data: "x\n", generalPurposeBitFlag: 0x1 },
    ]);
    expect(encrypted.errorCode).toBe("INVALID_ARCHIVE");
    const bzip2 = await runCase([{ name: "odd.tex", data: "x\n", method: 12 }]);
    expect(bzip2.errorCode).toBe("INVALID_ARCHIVE");
  });

  it("rejects forged sizes and CRCs", async () => {
    const forgedSize = await runCase([
      {
        name: "forged.tex",
        data: "short\n",
        sizesOverride: { compressed: 6, uncompressed: 6_000_000 },
      },
    ]);
    expect(["LIMIT_EXCEEDED", "INVALID_ARCHIVE"]).toContain(forgedSize.errorCode);
    const forgedCrc = await runCase([
      { name: "crc.tex", data: "content\n", crcOverride: 0xdeadbeef },
    ]);
    expect(forgedCrc.errorCode).toBe("INVALID_ARCHIVE");
  });

  it("aborts entries that exceed the per-file byte budget", async () => {
    const zeroes = Buffer.alloc(101 * 1024 * 1024, 0);
    const job = await runCase([{ name: "big.tex", data: zeroes, method: 8 }]);
    expect(job.errorCode).toBe("LIMIT_EXCEEDED");
  });

  it("rejects nested archives, unsupported types and invalid text", async () => {
    const nested = await runCase([
      { name: "inner.zip", data: Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]) },
    ]);
    expect(nested.errorCode).toBe("INVALID_ARCHIVE");
    const binary = await runCase([{ name: "notes.docx", data: "PK pretending\n" }]);
    expect(binary.errorCode).toBe("INVALID_ARCHIVE");
    const invalidText = await runCase([
      { name: "main.tex", data: Buffer.from([0xff, 0xfe, 0x00, 0x28]) },
    ]);
    expect(invalidText.errorCode).toBe("INVALID_ARCHIVE");
    const empty = await runCase([]);
    expect(empty.errorCode).toBe("INVALID_ARCHIVE");
  });
});
