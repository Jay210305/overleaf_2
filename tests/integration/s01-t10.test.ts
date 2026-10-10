import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";

loadEnvFile(".env");

describe("S01-T10 Deliver persisted development sample vertical slice", () => {
  let db: DatabaseClient;
  let storage: S3StorageAdapter;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    await storage.ensureBucketExists();
  });

  afterAll(async () => {
    await db.close();
  });

  it("successfully reads persisted sample traversing API, PG, and S3", async () => {
    const app = createServer({
      checkReadiness: async () => true,
      db,
      storage,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/development/sample",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["cache-control"]).toBe("no-store");

    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.project).toBeDefined();
    expect(body.project.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.storage).toBeDefined();
    expect(body.storage.key).toContain("projects/");
    expect(body.storage.sha256).toHaveLength(64);

    await app.close();
  });

  it("does not expose development sample endpoint in production", async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const app = createServer({
        checkReadiness: async () => true,
        db,
        storage,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/development/sample",
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
