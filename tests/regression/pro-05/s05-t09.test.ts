import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { runStorageGc } from "../../../apps/jobs/src/maintenance/storage-gc.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

loadEnvFile(".env");

describe("S05-T09 immutable revision retention", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let blobKey: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../../packages/db/migrations/0005-upload-intents.sql"),
        "utf8",
      ),
    );
    const owner = await fixture.seed();
    projectId = (
      await createProject(fixture.db, owner.id, {
        title: "Revision retention fixture",
        compiler: "pdflatex",
      })
    ).id;
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
    if (storage && blobKey) await storage.delete(blobKey);
    if (fixture) await fixture.close();
  });

  it("keeps a revision's blob when physical node deletion cascades its item row", async () => {
    const bytes = Buffer.from("historical binary");
    const hash = createHash("sha256").update(bytes).digest("hex");
    blobKey = `projects/${projectId}/blobs/${hash}`;
    await storage.put(blobKey, bytes, "application/octet-stream");
    const node = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes
       (project_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, 'historic.bin', 'FILE', 'application/octet-stream', 'BINARY', $2, $3)
       RETURNING id`,
      [projectId, bytes.length, blobKey],
    );
    const revision = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions
       (project_id, revision_no, manifest_key, manifest_hash, source)
       VALUES ($1, 9001, $2, $3, 'manual') RETURNING id`,
      [projectId, `projects/${projectId}/revisions/9001.json`, "a".repeat(64)],
    );
    await fixture.db.query(
      `INSERT INTO revision_items (revision_id, node_id, path, blob_key, sha256)
       VALUES ($1, $2, 'historic.bin', $3, $4)`,
      [revision.rows[0]!.id, node.rows[0]!.id, blobKey, hash],
    );
    await fixture.db.query("DELETE FROM project_nodes WHERE id = $1", [node.rows[0]!.id]);
    const items = await fixture.db.query<{ blob_key: string }>(
      "SELECT blob_key FROM revision_items WHERE revision_id = $1",
      [revision.rows[0]!.id],
    );
    expect(items.rows).toEqual([]);

    const outcome = await runStorageGc(fixture.db, storage, {
      projectId,
      now: new Date(Date.now() + 11 * 60_000),
    });
    expect(outcome.deleted).toBe(0);
    expect(await storage.head(blobKey)).not.toBeNull();
  });
});
