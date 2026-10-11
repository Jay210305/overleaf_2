import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";

loadEnvFile(".env");

describe("PL-05 Walking Skeleton and Gate Stabilization (S01-T10)", () => {
  it("verifies the complete walking skeleton end-to-end integration path", async () => {
    const config = parseServerConfig(process.env);
    const db = new DatabaseClient(config.DATABASE_URL);
    const storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    await storage.ensureBucketExists();

    try {
      const app = createServer({
        checkReadiness: async () => true,
        db,
        storage,
      });

      // 1. Health live
      const liveRes = await app.inject({ method: "GET", url: "/api/v1/health/live" });
      expect(liveRes.statusCode).toBe(200);

      // 2. Health ready
      const readyRes = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
      expect(readyRes.statusCode).toBe(200);

      // 3. Persisted development vertical slice
      const sampleRes = await app.inject({ method: "GET", url: "/api/v1/development/sample" });
      expect(sampleRes.statusCode).toBe(200);
      const sampleBody = JSON.parse(sampleRes.body);
      expect(sampleBody.status).toBe("ok");
      expect(sampleBody.project).toBeDefined();
      expect(sampleBody.storage).toBeDefined();

      await app.close();
    } finally {
      await db.close();
    }
  });
});
