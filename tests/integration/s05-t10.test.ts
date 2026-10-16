import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  prepareImportBlobs,
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
  async function stageValidated(key = randomUUID()): Promise<ImportJobView> {
    const bytes = validArchive();
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: key,
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
      title: "Imported thesis",
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
    const failing = {
      put: async () => {
        throw new Error("storage outage");
      },
    };
    const { files } = await applyFiles();
    await expect(
      prepareImportBlobs(failing as unknown as S3StorageAdapter, reserved.pendingProjectId, files),
    ).rejects.toThrow("storage outage");
    const current = await jobs.get(job.id);
    expect(current?.status).toBe("validated");
    expect(current?.projectId).toBeNull();
    const projects = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      reserved.pendingProjectId,
    ]);
    expect(projects.rows).toHaveLength(0);
  });

  it("writes deterministic blob keys on retry and exposes no object keys", async () => {
    const job = await stageValidated();
    const reserved = await jobs.reserveProjectId(job.id);
    const { files } = await applyFiles();
    const first = await prepareImportBlobs(storage, reserved.pendingProjectId, files);
    const second = await prepareImportBlobs(storage, reserved.pendingProjectId, files);
    expect([...second.entries()]).toEqual([...first.entries()]);
    expect(first.get("assets/fig.png")).toBe(
      `projects/${reserved.pendingProjectId}/blobs/${sha256Hex(minimalPng())}`,
    );
    const stored = await storage.getLimited(first.get("assets/fig.png")!, 1024 * 1024);
    expect(Buffer.from(stored)).toEqual(minimalPng());
    const view = await jobs.get(job.id);
    expect(JSON.stringify(view)).not.toContain("pendingProjectId");
    expect(JSON.stringify(view)).not.toContain("projects/");
  });
});
