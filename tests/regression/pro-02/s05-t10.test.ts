import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { applyValidatedImport } from "../../../apps/jobs/src/imports/apply-project.js";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import {
  buildImportArchive,
  importIntroTex,
  importMainTex,
  settleValidatedJob,
} from "../../helpers/import-apply.js";
import { minimalPng, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

/**
 * S05-T10 PRO-02 slice: a validated ZIP becomes one durable project with an
 * ID-based tree, canonical Yjs text replayable through the standard text
 * service shape, and verified content-addressed binaries.
 */
describe("S05-T10 PRO-02 import creates a consistent project", () => {
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

  it("applies nested folders, texts and one binary with canonical replay", async () => {
    const title = `PRO-02 import ${randomUUID()}`;
    const { bytes, job } = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      actorId,
      title,
      buildImportArchive(),
    );
    expect(job.archiveSize).toBe(bytes.length);
    const result = await applyValidatedImport(fixture.db, storage, job.id);
    expect(result.status).toBe("succeeded");
    const projectId = result.projectId!;
    const nodes = await fixture.db.query<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
      mime: string;
      content_kind: string;
      size_bytes: string;
      blob_key: string | null;
    }>(
      `SELECT id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key
         FROM project_nodes WHERE project_id = $1`,
      [projectId],
    );
    // Manifest has 6 entries: main.tex, chapters/, chapters/intro.tex,
    // refs.bib, assets/fig.png plus the implied assets/ folder.
    expect(nodes.rows).toHaveLength(6);
    const byPath = new Map<string, (typeof nodes.rows)[number]>();
    const idByPath = new Map<string, string>();
    for (const row of nodes.rows) {
      const parentPath =
        row.parent_id === null
          ? ""
          : ([...idByPath.entries()].find(([, id]) => id === row.parent_id)?.[0] ?? "");
      const fullPath = parentPath === "" ? row.name : `${parentPath}/${row.name}`;
      byPath.set(fullPath, row);
      idByPath.set(fullPath, row.id);
    }
    expect(byPath.get("main.tex")?.content_kind).toBe("TEXT");
    expect(byPath.get("chapters")?.kind).toBe("FOLDER");
    expect(byPath.get("assets")?.kind).toBe("FOLDER");
    const png = byPath.get("assets/fig.png")!;
    expect(png.content_kind).toBe("BINARY");
    expect(png.blob_key).toBe(`projects/${projectId}/blobs/${sha256Hex(minimalPng())}`);
    for (const [path, expected] of [
      ["main.tex", importMainTex],
      ["chapters/intro.tex", importIntroTex],
    ] as const) {
      const fileId = byPath.get(path)!.id;
      const updates = await fixture.db.query<{ payload_bytes: Buffer }>(
        "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
        [fileId],
      );
      expect(updates.rows).toHaveLength(1);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(updates.rows[0]!.payload_bytes));
      expect(doc.getText("content").toString()).toBe(expected);
      doc.destroy();
    }
    const fetched = await storage.getLimited(png.blob_key!, 1024 * 1024);
    expect(Buffer.from(fetched)).toEqual(minimalPng());
  });

  it("retrying the same job never duplicates the project", async () => {
    const title = `PRO-02 retry ${randomUUID()}`;
    const { job } = await settleValidatedJob(fixture.db, storage, jobs, actorId, title);
    const first = await applyValidatedImport(fixture.db, storage, job.id);
    const second = await applyValidatedImport(fixture.db, storage, job.id);
    expect(second.projectId).toBe(first.projectId);
    const projects = await fixture.db.query("SELECT id FROM projects WHERE title = $1", [title]);
    expect(projects.rows).toHaveLength(1);
  });
});
