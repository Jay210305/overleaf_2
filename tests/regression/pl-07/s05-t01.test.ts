import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";

loadEnvFile(".env");

describe("S05-T01 bounded object verification", () => {
  it("stops an object read once it exceeds the backend limit", async () => {
    const config = parseServerConfig(process.env);
    const storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    const key = `projects/${randomUUID()}/uploads/${randomUUID()}`;
    await storage.put(key, Buffer.from("12345"), "text/plain");
    try {
      await expect(storage.getLimited(key, 4)).rejects.toMatchObject({ name: "StorageLimitError" });
      await expect(storage.getLimited(key, 5)).resolves.toEqual(Buffer.from("12345"));
    } finally {
      await storage.delete(key);
    }
  });
});
