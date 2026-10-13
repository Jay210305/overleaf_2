import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import {
  ImportJobRepository,
  type ImportJobView,
} from "../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { buildImportArchiveKey } from "../../packages/storage/src/content-policy.js";
import { runImportValidationPass } from "../../apps/jobs/src/imports/worker.js";
import type { DatabaseClient } from "../../packages/db/src/client.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { buildZip, minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

const title = "Imported thesis";

function validArchive(): Buffer {
  return buildZip([
    { name: "main.tex", data: "\\documentclass{article}\n\\begin{document}Hola\\end{document}\n" },
    { name: "chapters/", data: undefined },
    { name: "chapters/intro.tex", data: "\\section{Intro}\nContenido.\n" },
    { name: "refs.bib", data: "@book{key, title={T}}\n" },
    { name: "assets/fig.png", data: minimalPng() },
  ]);
}

describe("S05-T03 archive validation and import jobs", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0006-import-jobs.sql"),
        "utf8",
      ),
    );
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

  /**
   * The validation worker is global by design, and S05-T03 test files run in
   * parallel workers against shared local services. Settle loops therefore
   * wait for OUR job's terminal state instead of asserting which pass (or
   * process) moved it; concurrent workers only accelerate the outcome.
   */
  async function settle(
    jobId: string,
    runner: S3StorageAdapter = storage,
    db: DatabaseClient = fixture.db,
  ): Promise<ImportJobView> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(jobId);
      if (current && (current.status === "validated" || current.status === "failed")) {
        return current;
      }
      await runImportValidationPass(db, runner, { limit: 5 });
    }
    throw new Error(`import job ${jobId} did not settle`);
  }

  async function sweepSettled(archiveKey: string): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      if ((await storage.head(archiveKey)) === null) return;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    throw new Error(`rejected archive ${archiveKey} was not swept`);
  }

  async function stageValid(key = randomUUID()) {
    const bytes = validArchive();
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    });
    expect(reserved.created).toBe(true);
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    const queued = await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    expect(queued.status).toBe("queued");
    return { bytes, job: queued };
  }

  it("reserves one staging job with a deterministic server-only archive key", async () => {
    const bytes = validArchive();
    const { job, created } = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    });
    expect(created).toBe(true);
    expect(job.status).toBe("staging");
    expect(job.archiveKey).toBe(buildImportArchiveKey(actorId, job.id));
    expect(job.projectId).toBeNull();
    expect(job.manifest).toBeNull();
  });

  it("returns the same job for the same actor, key and fingerprint", async () => {
    const bytes = validArchive();
    const input = {
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    };
    const first = await jobs.reserve(input);
    const second = await jobs.reserve(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
  });

  it("rejects a reused key with changed input without creating a job", async () => {
    const key = randomUUID();
    const first = validArchive();
    await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(first),
      archiveSize: first.length,
      title,
    });
    const second = buildZip([{ name: "other.tex", data: "x\n" }]);
    await expect(
      jobs.reserve({
        actorId,
        idempotencyKey: key,
        archiveSha256: sha256Hex(second),
        archiveSize: second.length,
        title,
      }),
    ).rejects.toMatchObject({ code: "CONSTRAINT_VIOLATION" });
  });

  it("serializes concurrent reservations for the same key", async () => {
    const bytes = validArchive();
    const input = {
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    };
    const [left, right] = await Promise.all([jobs.reserve(input), jobs.reserve(input)]);
    expect([left.created, right.created].sort()).toEqual([false, true]);
    expect(left.job.id).toBe(right.job.id);
  });

  it("claims, completes and releases validation leases", async () => {
    const { job } = await stageValid();
    let claimed: ImportJobView | null = null;
    for (let attempt = 0; attempt < 10 && claimed?.id !== job.id; attempt++) {
      claimed = await jobs.claimNext({ leaseMs: 60_000 });
      if (claimed && claimed.id !== job.id) await jobs.release(claimed.id);
    }
    expect(claimed?.id).toBe(job.id);
    await jobs.release(job.id);
    let reclaimed: ImportJobView | null = null;
    for (let attempt = 0; attempt < 10 && reclaimed?.id !== job.id; attempt++) {
      reclaimed = await jobs.claimNext({ leaseMs: 60_000 });
      if (reclaimed && reclaimed.id !== job.id) await jobs.release(reclaimed.id);
    }
    expect(reclaimed?.id).toBe(job.id);
    await jobs.fail(job.id, "INVALID_ARCHIVE");
    const failed = await jobs.get(job.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorCode).toBe("INVALID_ARCHIVE");
  });

  it("validates a nested archive without mutating project state", async () => {
    const project = await createProject(fixture.db, actorId, {
      title: "S05-T03 untouched project",
      compiler: "pdflatex",
    });
    void project;
    const counts = async () =>
      fixture.db.query<{ kind: string; total: string }>(
        `SELECT 'projects' AS kind, COUNT(*)::text AS total FROM projects
         UNION ALL SELECT 'nodes', COUNT(*)::text FROM project_nodes
         UNION ALL SELECT 'texts', COUNT(*)::text FROM text_documents
         UNION ALL SELECT 'updates', COUNT(*)::text FROM crdt_updates`,
      );
    const before = await counts();
    const { bytes, job } = await stageValid();
    const done = await settle(job.id);
    expect(done.status).toBe("validated");
    expect(done.manifest?.version).toBe(1);
    const paths = done.manifest?.entries.map((entry) => entry.path);
    expect(paths).toEqual([
      "assets/fig.png",
      "chapters/",
      "chapters/intro.tex",
      "main.tex",
      "refs.bib",
    ]);
    const main = done.manifest?.entries.find((entry) => entry.path === "main.tex");
    expect(main).toMatchObject({ kind: "TEXT", mime: "application/x-tex" });
    if (main?.kind !== "TEXT") throw new Error("main.tex manifest entry missing");
    expect(main.size).toBeGreaterThan(0);
    expect(main.sha256).toBe(
      sha256Hex(Buffer.from("\\documentclass{article}\n\\begin{document}Hola\\end{document}\n")),
    );
    expect(job.archiveSha256).toBe(sha256Hex(bytes));
    const after = await counts();
    expect(after.rows).toEqual(before.rows);
    expect(await storage.head(job.archiveKey)).not.toBeNull();
  });

  it("fails traversal archives and sweeps the rejected bytes", async () => {
    const bytes = buildZip([{ name: "../../evil.tex", data: "x\n" }]);
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    const flaky = Object.create(
      Object.getPrototypeOf(storage),
      Object.getOwnPropertyDescriptors(storage),
    ) as S3StorageAdapter;
    flaky.delete = async (): Promise<void> => {
      throw new Error("transient delete outage for the whole pass");
    };
    const done = await settle(reserved.job.id, flaky);
    expect(done.status).toBe("failed");
    expect(done.errorCode).toBe("UNSAFE_PATH");
    expect(done.manifest).toBeNull();
    await sweepSettled(reserved.job.archiveKey);
    expect(await storage.head(reserved.job.archiveKey)).toBeNull();
  });

  it("fails decompression bombs that lie about their size", async () => {
    const data = Buffer.from("x\n");
    const bytes = buildZip([
      {
        name: "bomb.tex",
        data,
        method: 8,
        sizesOverride: { compressed: data.length, uncompressed: 200 * 1024 * 1024 },
      },
    ]);
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    const done = await settle(reserved.job.id);
    expect(done.status).toBe("failed");
    expect(done.errorCode).toBe("LIMIT_EXCEEDED");
  });

  it("fails jobs whose staged bytes are missing or do not match", async () => {
    const missing = validArchive();
    const absent = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(missing),
      archiveSize: missing.length,
      title,
    });
    await jobs.enqueue(absent.job.id, {
      archiveSha256: sha256Hex(missing),
      archiveSize: missing.length,
    });
    const swapped = validArchive();
    const mismatched = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(swapped),
      archiveSize: swapped.length,
      title,
    });
    const other = buildZip([{ name: "main.tex", data: "different bytes here\n" }]);
    await storage.put(mismatched.job.archiveKey, other, "application/zip");
    await expect(
      jobs.enqueue(mismatched.job.id, {
        archiveSha256: sha256Hex(other),
        archiveSize: other.length,
      }),
    ).rejects.toMatchObject({ code: "CONSTRAINT_VIOLATION" });
    await jobs.enqueue(mismatched.job.id, {
      archiveSha256: sha256Hex(swapped),
      archiveSize: swapped.length,
    });
    const [absentDone, mismatchedDone] = await Promise.all([
      settle(absent.job.id),
      settle(mismatched.job.id),
    ]);
    expect(absentDone.status).toBe("failed");
    expect(absentDone.errorCode).toBe("INVALID_ARCHIVE");
    expect(mismatchedDone.status).toBe("failed");
    expect(mismatchedDone.errorCode).toBe("INVALID_ARCHIVE");
  });
});
