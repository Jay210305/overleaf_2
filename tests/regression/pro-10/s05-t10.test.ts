import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { validateZipArchive } from "../../../apps/jobs/src/imports/zip.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildZip, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

describe("S05-T10 PRO-10 archive recheck", () => {
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

  it.each([
    ["traversal", buildZip([{ name: "../escape.tex", data: "unsafe" }]), "UNSAFE_PATH"],
    [
      "symlink",
      buildZip([{ name: "link.tex", data: "main.tex", unixMode: 0o120777 }]),
      "INVALID_ARCHIVE",
    ],
  ] as const)(
    "rejects replaced %s bytes before committing any project",
    async (_name, replacement, code) => {
      const owner = await fixture.seed();
      const archive = buildZip([{ name: "main.tex", data: "safe" }]);
      const jobs = new ImportJobRepository(fixture.db);
      const reserved = await jobs.reserve({
        actorId: owner.id,
        idempotencyKey: randomUUID(),
        archiveSha256: sha256Hex(archive),
        archiveSize: archive.length,
        title: "Denied import",
      });
      const manifest = await validateZipArchive(archive);
      await fixture.db.query(
        "UPDATE import_jobs SET status = 'validated', manifest = $2::jsonb, manifest_version = 1 WHERE id = $1",
        [reserved.job.id, JSON.stringify(manifest)],
      );
      const withId = await jobs.reserveProjectId(reserved.job.id);
      await storage.put(reserved.job.archiveKey, replacement, "application/zip");
      keys.push(reserved.job.archiveKey);
      await fixture.db.query(
        "UPDATE import_jobs SET archive_sha256 = $2, archive_size = $3 WHERE id = $1",
        [reserved.job.id, sha256Hex(replacement), replacement.length],
      );
      await expect(
        applyValidatedImport(fixture.db, storage, reserved.job.id),
      ).rejects.toMatchObject({ code });
      expect((await jobs.get(reserved.job.id))?.status).toBe("failed");
      const visible = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
        withId.pendingProjectId,
      ]);
      expect(visible.rows).toHaveLength(0);
    },
  );
});
