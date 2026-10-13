import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("S05-T01 permitted binary uploads", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let cookie: string;
  let csrf: string;

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
        title: "Asset project",
        compiler: "pdflatex",
      })
    ).id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      storage,
      origin,
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  const presign = (fileName: string, bytes: Buffer) =>
    app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/presign`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { fileName, mime: "image/png", sizeBytes: bytes.length, sha256: sha256(bytes) },
    });

  it("rejects a PNG signature without a valid image body before creating a node", async () => {
    const malformed = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(20),
    ]);
    const fileName = `broken-${randomUUID()}.png`;
    const signed = await presign(fileName, malformed);
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect((await fetch(url, { method: "PUT", body: malformed })).status).toBe(200);
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/complete`,
      headers: { origin, cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() },
      payload: { uploadId, sha256: sha256(malformed) },
    });
    expect(completed.statusCode).toBe(422);
    const nodes = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
      [projectId, fileName],
    );
    expect(nodes.rows).toEqual([]);
  });

  it("stores a valid PNG as a private binary node with identical bytes", async () => {
    const fileName = `chart-${randomUUID()}.png`;
    const signed = await presign(fileName, png);
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect((await fetch(url, { method: "PUT", body: png })).status).toBe(200);
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/complete`,
      headers: { origin, cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() },
      payload: { uploadId, sha256: sha256(png) },
    });
    expect(completed.statusCode).toBe(201);
    expect(completed.json()).toMatchObject({
      name: fileName,
      contentKind: "BINARY",
      sizeBytes: png.length,
    });
    const node = await fixture.db.query<{ blob_key: string }>(
      "SELECT blob_key FROM project_nodes WHERE id = $1 AND project_id = $2",
      [completed.json().id, projectId],
    );
    expect(node.rows[0]?.blob_key).toBe(`projects/${projectId}/blobs/${sha256(png)}`);
    expect(Buffer.from(await storage.get(node.rows[0]!.blob_key))).toEqual(png);
  });
});
