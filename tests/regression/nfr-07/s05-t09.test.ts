import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { createServer } from "../../../apps/api/src/server.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

describe("S05-T09 concurrent project upload quota", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let ownerId: string;
  let cookie: string;
  let csrf: string;
  const stagingKeys: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../../packages/db/migrations/0005-upload-intents.sql"),
        "utf8",
      ),
    );
    const owner = await fixture.seed();
    ownerId = owner.id;
    projectId = (
      await createProject(fixture.db, owner.id, {
        title: "Concurrent quota project",
        compiler: "pdflatex",
      })
    ).id;
    await fixture.db.query(
      "UPDATE project_nodes SET size_bytes = $1 WHERE project_id = $2 AND deleted_at IS NULL",
      [500 * 1024 * 1024 - 1, projectId],
    );
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
    if (storage) for (const key of stagingKeys) await storage.delete(key);
    if (fixture) await fixture.close();
  });

  it("commits only one of two completions competing for the final project byte", async () => {
    const bytes = Buffer.from("x");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const headers = { origin, cookie, "x-csrf-token": csrf };
    const presigned: Array<{ uploadId: string; url: string }> = [];
    for (let index = 0; index < 2; index++) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/uploads/presign`,
        headers,
        payload: {
          fileName: `quota-${index}-${randomUUID()}.bib`,
          mime: "text/plain",
          sizeBytes: bytes.length,
          sha256,
        },
      });
      expect(response.statusCode).toBe(200);
      presigned.push(response.json());
    }
    for (const signed of presigned) {
      expect((await fetch(signed.url, { method: "PUT", body: bytes })).status).toBe(200);
      stagingKeys.push(`projects/${projectId}/uploads/${signed.uploadId}`);
    }
    const responses = await Promise.all(
      presigned.map(({ uploadId }) =>
        app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/uploads/complete`,
          headers: { ...headers, "idempotency-key": randomUUID() },
          payload: { uploadId, sha256 },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 413]);
    const usage = await fixture.db.query<{ bytes: string; count: string }>(
      `SELECT SUM(size_bytes)::text AS bytes,
              COUNT(*) FILTER (WHERE name LIKE 'quota-%')::text AS count
       FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId],
    );
    expect(Number(usage.rows[0]?.bytes)).toBe(500 * 1024 * 1024);
    expect(Number(usage.rows[0]?.count)).toBe(1);
  });

  it("accepts the last node slot and rejects the next upload", async () => {
    const nodeProjectId = (
      await createProject(fixture.db, ownerId, {
        title: "Node quota project",
        compiler: "pdflatex",
      })
    ).id;
    await fixture.db.query(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, size_bytes)
       SELECT $1, 'fixture-' || n || '.bib', 'FILE', 'text/plain', 'TEXT', 0
       FROM generate_series(1, 1998) AS n`,
      [nodeProjectId],
    );
    const bytes = Buffer.from("x");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const headers = { origin, cookie, "x-csrf-token": csrf };
    const presign = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${nodeProjectId}/uploads/presign`,
      headers,
      payload: { fileName: "last.bib", mime: "text/plain", sizeBytes: 1, sha256 },
    });
    expect(presign.statusCode).toBe(200);
    const signed = presign.json() as { uploadId: string; url: string };
    expect((await fetch(signed.url, { method: "PUT", body: bytes })).status).toBe(200);
    stagingKeys.push(`projects/${nodeProjectId}/uploads/${signed.uploadId}`);
    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${nodeProjectId}/uploads/complete`,
      headers: { ...headers, "idempotency-key": randomUUID() },
      payload: { uploadId: signed.uploadId, sha256 },
    });
    expect(complete.statusCode).toBe(201);
    const extra = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${nodeProjectId}/uploads/presign`,
      headers,
      payload: { fileName: "excess.bib", mime: "text/plain", sizeBytes: 1, sha256 },
    });
    expect(extra.statusCode).toBe(413);
    const count = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL",
      [nodeProjectId],
    );
    expect(Number(count.rows[0]?.count)).toBe(2000);
  });
});
