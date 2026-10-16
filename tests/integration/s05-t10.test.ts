import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseServerConfig } from "@latex-collab/config/server";
import {
  ImportJobRepository,
  type ImportJobView,
} from "../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  readArchiveForApply,
  validateZipArchive,
  ZipValidationError,
} from "../../apps/jobs/src/imports/zip.js";
import {
  applyValidatedImport,
  prepareImportBlobs,
  runImportApplyPass,
  type ImportFileBytes,
} from "../../apps/jobs/src/imports/apply-project.js";
import { runImportValidationPass } from "../../apps/jobs/src/imports/worker.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { applyImportMigrations } from "../helpers/import-migrations.js";
import { buildZip, minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

const mainTex = "\\documentclass{article}\n\\begin{document}Hola\\end{document}\n";
const introTex = "\\section{Intro}\nContenido.\n";

function validArchive(): Buffer {
  return buildZip([
    { name: "main.tex", data: mainTex },
    { name: "chapters/", data: undefined },
    { name: "chapters/intro.tex", data: introTex },
    { name: "refs.bib", data: "@book{key, title={T}}\n" },
    { name: "assets/fig.png", data: minimalPng() },
  ]);
}

describe("S05-T10 validated import application", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    const owner = await fixture.seed();
    actorId = owner.id;
    // Shared local services accumulate validated fixture rows from earlier
    // sessions ahead of OUR jobs in FIFO order, and no pass ever applied
    // them. Remove rows predating this file run (with their dependent intake
    // rows first: deleting a job nulls import_upload_intents.completed_job_id
    // through its FK, which the completion-pair CHECK forbids). Suites run
    // serially (maxWorkers: 1) and evidence lives in test reports, so no
    // concurrent or completed suite is affected; other statuses are left
    // for their own passes.
    const fileStart = new Date();
    await fixture.db.query(
      `DELETE FROM import_upload_intents WHERE completed_job_id IN (
         SELECT id FROM import_jobs WHERE status = 'validated' AND created_at < $1
       )`,
      [fileStart],
    );
    await fixture.db.query(
      "DELETE FROM import_jobs WHERE status = 'validated' AND created_at < $1",
      [fileStart],
    );
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

  /** Stage one archive through reserve/enqueue/validate and settle OUR job. */
  async function stageValidated(
    key = randomUUID(),
    title = "Imported thesis",
  ): Promise<ImportJobView> {
    const bytes = validArchive();
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title,
    });
    await storage.put(reserved.job.archiveKey, bytes, "application/zip");
    await jobs.enqueue(reserved.job.id, {
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await jobs.get(reserved.job.id);
      if (current && current.status === "validated") return current;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    throw new Error("import job did not validate");
  }

  async function applyFiles(): Promise<{ manifest: Awaited<ReturnType<typeof validateZipArchive>>; files: Map<string, ImportFileBytes> }> {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const raw = await readArchiveForApply(bytes, manifest);
    const files = new Map<string, ImportFileBytes>();
    for (const entry of manifest.entries) {
      if (entry.kind === "DIRECTORY") continue;
      files.set(entry.path, {
        data: raw.get(entry.path)!,
        mime: entry.mime,
        sha256: entry.sha256,
        kind: entry.kind,
      });
    }
    return { manifest, files };
  }

  it("reopens a validated archive with exact file bytes", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const files = await readArchiveForApply(bytes, manifest);
    expect(files.get("main.tex")?.toString("utf8")).toBe(mainTex);
    expect(files.get("chapters/intro.tex")?.toString("utf8")).toBe(introTex);
    expect(files.get("assets/fig.png")).toEqual(minimalPng());
    expect(files.has("chapters/")).toBe(false);
  });

  it("rejects archive bytes changed after validation without a partial map", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const tampered = Buffer.from(bytes);
    const marker = Buffer.from("Hola");
    const at = tampered.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    tampered[at] = tampered[at]! ^ 0xff;
    let files: Map<string, Buffer> | null = null;
    await expect(
      readArchiveForApply(tampered, manifest).then(
        (result) => {
          files = result;
        },
        (error) => {
          throw error;
        },
      ),
    ).rejects.toBeInstanceOf(ZipValidationError);
    expect(files).toBeNull();
  });

  it("rejects a tampered manifest hash or version", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const tamperedHash = {
      version: 1 as const,
      entries: manifest.entries.map((entry, index) =>
        index === 0 && entry.kind !== "DIRECTORY"
          ? { ...entry, sha256: "0".repeat(64) }
          : entry,
      ),
    };
    await expect(readArchiveForApply(bytes, tamperedHash)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    const tamperedVersion = { version: 2, entries: manifest.entries } as unknown as typeof manifest;
    await expect(readArchiveForApply(bytes, tamperedVersion)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
  });

  it("rejects a folder/file path collision before any project row commits", async () => {
    const bytes = buildZip([
      { name: "notes.tex", data: "file blocks the folder\n" },
      { name: "notes.tex/extra.tex", data: mainTex },
    ]);
    const manifest = await validateZipArchive(bytes);
    await expect(readArchiveForApply(bytes, manifest)).rejects.toBeInstanceOf(ZipValidationError);
  });

  it("reserves one project ID across repeated reservations", async () => {
    const job = await stageValidated();
    const first = await jobs.reserveProjectId(job.id);
    const second = await jobs.reserveProjectId(job.id);
    expect(first.pendingProjectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(second.pendingProjectId).toBe(first.pendingProjectId);
    const current = await jobs.get(job.id);
    expect(current?.status).toBe("validated");
    expect(current?.projectId).toBeNull();
  });

  it("leaves the job validated with its reservation when blob storage fails", async () => {
    const job = await stageValidated();
    const reserved = await jobs.reserveProjectId(job.id);
    const projectId = reserved.pendingProjectId!;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    const failing = {
      put: async () => {
        throw new Error("storage outage");
      },
    };
    const { files } = await applyFiles();
    await expect(
      prepareImportBlobs(failing as unknown as S3StorageAdapter, projectId, files),
    ).rejects.toThrow("storage outage");
    const current = await jobs.get(job.id);
    expect(current?.status).toBe("validated");
    expect(current?.projectId).toBeNull();
    const projects = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [projectId]);
    expect(projects.rows).toHaveLength(0);
  });

  it("writes deterministic blob keys on retry and exposes no object keys", async () => {
    const job = await stageValidated();
    const reserved = await jobs.reserveProjectId(job.id);
    const projectId = reserved.pendingProjectId!;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    const { files } = await applyFiles();
    const first = await prepareImportBlobs(storage, projectId, files);
    const second = await prepareImportBlobs(storage, projectId, files);
    expect([...second.entries()]).toEqual([...first.entries()]);
    expect(first.get("assets/fig.png")).toBe(
      `projects/${projectId}/blobs/${sha256Hex(minimalPng())}`,
    );
    const stored = await storage.getLimited(first.get("assets/fig.png")!, 1024 * 1024);
    expect(Buffer.from(stored)).toEqual(minimalPng());
    const view = await jobs.get(job.id);
    expect(JSON.stringify(view)).not.toContain("pendingProjectId");
    expect(JSON.stringify(view)).not.toContain("projects/");
  });

  it("creates one consistent project from a validated archive", async () => {
    const title = `S05-T10 apply ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const result = await applyValidatedImport(fixture.db, storage, job.id);
    expect(result.status).toBe("succeeded");
    expect(result.projectId).toMatch(/^[0-9a-f-]{36}$/);
    const project = await fixture.db.query<{
      id: string;
      owner_id: string;
      title: string;
      status: string;
      main_file_id: string | null;
    }>("SELECT id, owner_id, title, status, main_file_id FROM projects WHERE id = $1", [
      result.projectId,
    ]);
    expect(project.rows).toHaveLength(1);
    expect(project.rows[0]).toMatchObject({ owner_id: actorId, title, status: "active" });
    const nodes = await fixture.db.query<{ name: string; kind: string; parent_id: string | null }>(
      "SELECT name, kind, parent_id FROM project_nodes WHERE project_id = $1",
      [result.projectId],
    );
    const byName = new Map(nodes.rows.map((row) => [row.name, row]));
    expect(byName.get("main.tex")?.kind).toBe("FILE");
    expect(byName.get("chapters")?.kind).toBe("FOLDER");
    expect(byName.get("intro.tex")?.kind).toBe("FILE");
    expect(byName.get("assets")?.kind).toBe("FOLDER");
    expect(byName.get("fig.png")?.kind).toBe("FILE");
    expect(byName.get("refs.bib")?.kind).toBe("FILE");
    const mainId = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'main.tex'",
        [result.projectId],
      )
    ).rows[0]!.id;
    expect(project.rows[0]!.main_file_id).toBe(mainId);
    const updates = await fixture.db.query<{ seq: number; payload_bytes: Buffer }>(
      `SELECT u.seq, u.payload_bytes FROM crdt_updates u
         JOIN project_nodes n ON n.id = u.file_id
        WHERE n.project_id = $1 AND n.name = 'main.tex' ORDER BY u.seq ASC`,
      [result.projectId],
    );
    expect(updates.rows.map((row) => Number(row.seq))).toEqual([1]);
    const doc = new Y.Doc();
    for (const row of updates.rows) Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
    expect(doc.getText("content").toString()).toBe(mainTex);
    doc.destroy();
  });

  it("returns the existing project on duplicate and concurrent apply", async () => {
    const title = `S05-T10 idempotent ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const first = await applyValidatedImport(fixture.db, storage, job.id);
    const second = await applyValidatedImport(fixture.db, storage, job.id);
    const [left, right] = await Promise.all([
      applyValidatedImport(fixture.db, storage, job.id),
      applyValidatedImport(fixture.db, storage, job.id),
    ]);
    for (const result of [second, left, right]) {
      expect(result.status).toBe("succeeded");
      expect(result.projectId).toBe(first.projectId);
    }
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(1);
    const nodes = await fixture.db.query("SELECT id FROM project_nodes WHERE project_id = $1", [
      first.projectId,
    ]);
    expect(nodes.rows.length).toBeGreaterThan(0);
  });

  it("creates no rows when archive bytes were replaced after validation", async () => {
    const title = `S05-T10 replaced ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const current = await jobs.get(job.id);
    const original = await storage.getLimited(current!.archiveKey, 25 * 1024 * 1024);
    await storage.put(
      current!.archiveKey,
      Buffer.from("not the validated archive"),
      "application/zip",
    );
    await expect(applyValidatedImport(fixture.db, storage, job.id)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    // Restore the fixture archive so later passes observe the validated bytes.
    await storage.put(current!.archiveKey, Buffer.from(original), "application/zip");
    const still = await jobs.get(job.id);
    expect(still?.status).toBe("validated");
    expect(still?.projectId).toBeNull();
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(0);
  });

  it("rejects tampered manifests without writing project state", async () => {
    const title = `S05-T10 tampered ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const manifest = (await jobs.get(job.id))!.manifest!;
    const tampered = {
      version: 1 as const,
      entries: manifest.entries.map((entry) => ({ ...entry, path: `evil/${entry.path}` })),
    };
    await fixture.db.query("UPDATE import_jobs SET manifest = $1::jsonb WHERE id = $2", [
      JSON.stringify(tampered),
      job.id,
    ]);
    await expect(applyValidatedImport(fixture.db, storage, job.id)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    // Restore the validated manifest for later passes.
    await fixture.db.query("UPDATE import_jobs SET manifest = $1::jsonb WHERE id = $2", [
      JSON.stringify(manifest),
      job.id,
    ]);
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(0);
  });

  it("leaves no partial project when blob storage fails mid-apply", async () => {
    const title = `S05-T10 blobfail ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const failing = {
      getLimited: storage.getLimited.bind(storage),
      head: storage.head.bind(storage),
      put: async () => {
        throw new Error("blob outage");
      },
    };
    await expect(
      applyValidatedImport(fixture.db, failing as unknown as S3StorageAdapter, job.id),
    ).rejects.toThrow("blob outage");
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(0);
    const nodes = await fixture.db.query(
      "SELECT n.id FROM project_nodes n JOIN projects p ON p.id = n.project_id WHERE p.title = $1",
      [title],
    );
    expect(nodes.rows).toHaveLength(0);
  });

  it("fails poisoned re-verification jobs instead of wedging the queue", async () => {
    const title = `S05-T10 poison ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    const current = await jobs.get(job.id);
    await storage.put(current!.archiveKey, Buffer.from("poisoned bytes"), "application/zip");
    let done = await jobs.get(job.id);
    let failed = 0;
    for (let attempt = 0; attempt < 6 && done?.status === "validated"; attempt++) {
      const pass = await runImportApplyPass(fixture.db, storage, { limit: 5 });
      failed += pass.failed;
      done = await jobs.get(job.id);
    }
    expect(done?.status).toBe("failed");
    expect(done?.errorCode).toBe("INVALID_ARCHIVE");
    expect(done?.projectId).toBeNull();
    expect(failed).toBeGreaterThanOrEqual(1);
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(0);
  });

  it("applies validated jobs through the bounded pass and sweeps old archives", async () => {
    const title = `S05-T10 pass ${randomUUID()}`;
    const job = await stageValidated(randomUUID(), title);
    // Only this file's appliable rows can sit ahead of OUR job (beforeAll
    // cleared earlier sessions); settle it through the pass and require a
    // clean run (no failures or retries).
    let done = await jobs.get(job.id);
    let failed = 0;
    let retried = 0;
    for (let attempt = 0; attempt < 6 && done?.status !== "succeeded"; attempt++) {
      const pass = await runImportApplyPass(fixture.db, storage, { limit: 5 });
      failed += pass.failed;
      retried += pass.retried;
      done = await jobs.get(job.id);
    }
    expect(failed).toBe(0);
    expect(retried).toBe(0);
    expect(done?.status).toBe("succeeded");
    expect(done?.projectId).toMatch(/^[0-9a-f-]{36}$/);
    const projectBefore = done?.projectId;
    await runImportApplyPass(fixture.db, storage, { limit: 5 });
    const untouched = await jobs.get(job.id);
    expect(untouched?.status).toBe("succeeded");
    expect(untouched?.projectId).toBe(projectBefore);
    await fixture.db.query(
      "UPDATE import_jobs SET created_at = NOW() - INTERVAL '15 days' WHERE id = $1",
      [job.id],
    );
    expect(await storage.head(done!.archiveKey)).not.toBeNull();
    const sweep = await runImportApplyPass(fixture.db, storage, { limit: 5 });
    expect(sweep.swept).toBeGreaterThanOrEqual(1);
    expect(await storage.head(done!.archiveKey)).toBeNull();
    const swept = await jobs.get(job.id);
    expect(swept?.archiveSwept).toBe(true);
    const blob = await storage.getLimited(
      `projects/${done!.projectId}/blobs/${sha256Hex(minimalPng())}`,
      1024 * 1024,
    );
    expect(Buffer.from(blob)).toEqual(minimalPng());
  });
});
