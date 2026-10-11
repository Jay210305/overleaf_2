import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { z, compilerSchema, projectStatusSchema } from "@latex-collab/contracts";

loadEnvFile(".env");

const sampleResponseSchema = z.strictObject({
  status: z.literal("ok"),
  environment: z.string(),
  project: z.strictObject({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    title: z.string().min(1),
    compiler: compilerSchema,
    status: projectStatusSchema,
    currentRevision: z.number().int().min(0),
  }),
  storage: z.strictObject({
    key: z.string().startsWith("projects/"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().min(0),
    mime: z.string().min(1),
    contentPreview: z.string(),
  }),
});

describe("PL-06 Relational and Contract Invariants in Persisted Sample (S01-T10)", () => {
  it("enforces that returned sample payload strictly matches typed contract schemas", async () => {
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

      const res = await app.inject({ method: "GET", url: "/api/v1/development/sample" });
      expect(res.statusCode).toBe(200);

      const parsed = sampleResponseSchema.safeParse(JSON.parse(res.body));
      expect(parsed.success).toBe(true);

      await app.close();
    } finally {
      await db.close();
    }
  });
});
