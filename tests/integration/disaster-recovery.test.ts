import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { persistJobArtifacts } from "../../apps/jobs/src/compilation/artifacts.js";
import {
  createTrustedBackup,
  executeAutomatedRestore,
  verifyBackupIntegrity,
} from "../../infra/scripts/backup-restore.js";

describe("S15-T06 Disaster Recovery: Complete automated backup and restore (NFR-09)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let owner: { id: string; email: string };
  let projectId: string;
  let jobId: string;
  let pdfKey: string;
  let tempBackupDir: string;

  const validPdfBytes = new TextEncoder().encode("%PDF-1.5\nDisaster recovery test authentic PDF\n%%EOF");
  const validLogBytes = new TextEncoder().encode("Transcript: DR test compilation completed.\n");

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);

    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

    owner = await fixture.seed();
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    // Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { title: `DR Test Project ${randomUUID().slice(0, 8)}`, compiler: "pdflatex" },
    });
    projectId = projRes.json().id;

    // Enqueue compilation job
    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
        "idempotency-key": `idemp-dr-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    jobId = enqRes.json().id;

    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash: "d".repeat(64),
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: validPdfBytes, sha256: "hash-dr-pdf" },
        { name: "compile.log", mime: "text/plain", bytes: validLogBytes, sha256: "hash-dr-log" },
      ],
      retentionDays: 14,
    });
    pdfKey = artifactSet.pdfKey!;

    // Ensure any initial structural revision manifests exist in storage
    const initCheck = await verifyBackupIntegrity({ db: fixture.db, storage, projectId });
    for (const missingKey of initCheck.missingBlobs) {
      await storage.put(
        missingKey,
        new TextEncoder().encode(missingKey.endsWith(".json") ? "{}" : ""),
        missingKey.endsWith(".json") ? "application/json" : "application/octet-stream",
      );
    }

    tempBackupDir = await mkdtemp(join(tmpdir(), "dr-backup-"));
  });

  afterAll(async () => {
    if (tempBackupDir) {
      await rm(tempBackupDir, { recursive: true, force: true });
    }
    await fixture.close();
  });

  it("creates a complete trusted backup, detects corrupted/missing objects, and performs automated restore", async () => {
    // 1. Create complete backup
    const backupResult = await createTrustedBackup({
      db: fixture.db,
      storage,
      outputDir: tempBackupDir,
      projectId,
    });

    expect(backupResult.manifest.version).toBe("1.0");
    expect(backupResult.manifest.projectCount).toBeGreaterThan(0);
    expect(backupResult.manifest.blobs.length).toBeGreaterThan(0);

    // Initial integrity check must be intact
    const preCheck = await verifyBackupIntegrity({
      db: fixture.db,
      storage,
      projectId,
    });
    expect(preCheck.intact).toBe(true);

    // 2. Simulate disaster / storage corruption: delete PDF object from S3
    await storage.delete(pdfKey);

    const corruptedCheck = await verifyBackupIntegrity({
      db: fixture.db,
      storage,
      projectId,
    });
    expect(corruptedCheck.intact).toBe(false);
    expect(corruptedCheck.missingBlobs).toContain(pdfKey);

    // 3. Perform automated restore
    const restoreResult = await executeAutomatedRestore({
      db: fixture.db,
      storage,
      backupDir: tempBackupDir,
      projectId,
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.verification.intact).toBe(true);
    expect(restoreResult.verification.missingBlobs).toHaveLength(0);

    // 4. Verify object is readable and identical
    const restoredPdf = await storage.get(pdfKey);
    expect(new TextDecoder().decode(restoredPdf)).toContain("Disaster recovery test authentic PDF");

    // 5. Corrupted blob integrity test (tampered backup payload)
    const blobToCorrupt = backupResult.manifest.blobs.find((b) => b.key === pdfKey) ?? backupResult.manifest.blobs[0]!;
    await storage.delete(blobToCorrupt.key);
    const corruptedBlobPath = join(tempBackupDir, "blobs", `${blobToCorrupt.sha256}.bin`);
    const originalBytes = await readFile(corruptedBlobPath);
    try {
      await writeFile(corruptedBlobPath, Buffer.concat([originalBytes, Buffer.from("corrupted-extra-data")]));
      await expect(
        executeAutomatedRestore({
          db: fixture.db,
          storage,
          backupDir: tempBackupDir,
          projectId,
        }),
      ).rejects.toThrowError(/Corrupted backup blob/i);
    } finally {
      await writeFile(corruptedBlobPath, originalBytes);
    }
  });
});
