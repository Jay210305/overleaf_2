import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";

loadEnvFile(".env");

describe("Persisted Development Sample Vertical Slice", () => {
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

  it("traverses API to PG and object storage, and survives server restart", async () => {
    // 1. Initial server run
    const app1 = createServer({
      checkReadiness: async () => true,
      db,
      storage,
    });

    const res1 = await app1.inject({
      method: "GET",
      url: "/api/v1/development/sample",
    });

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe("ok");
    expect(body1.project.id).toBeDefined();
    expect(body1.storage.key).toBe(`projects/${body1.project.id}/sample.tex`);
    expect(body1.storage.sha256).toBeDefined();

    await app1.close();

    // 2. Restart server with a new instance
    const app2 = createServer({
      checkReadiness: async () => true,
      db,
      storage,
    });

    const res2 = await app2.inject({
      method: "GET",
      url: "/api/v1/development/sample",
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    // Verified that persisted data matches across server restart
    expect(body2.project.id).toBe(body1.project.id);
    expect(body2.project.title).toBe(body1.project.title);
    expect(body2.storage.key).toBe(body1.storage.key);
    expect(body2.storage.sha256).toBe(body1.storage.sha256);

    await app2.close();
  });

  it("ensures route is completely absent in production environment", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const prodApp = createServer({
        checkReadiness: async () => true,
        db,
        storage,
      });

      const res = await prodApp.inject({
        method: "GET",
        url: "/api/v1/development/sample",
      });

      expect(res.statusCode).toBe(404);
      await prodApp.close();
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
