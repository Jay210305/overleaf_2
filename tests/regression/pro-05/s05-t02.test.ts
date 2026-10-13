import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";

loadEnvFile(".env");

describe("S05-T02 signed PUT browser origin", () => {
  it("permits only the configured application origin on local object upload preflight", async () => {
    const config = parseServerConfig(process.env);
    const storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    const url = await storage.presign(
      "projects/11111111-1111-4111-8111-111111111111/uploads/22222222-2222-4222-8222-222222222222",
      "put",
      300,
    );
    const allowed = await fetch(url, {
      method: "OPTIONS",
      headers: {
        origin: config.APP_ORIGIN,
        "access-control-request-method": "PUT",
      },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(config.APP_ORIGIN);
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PUT");
    const denied = await fetch(url, {
      method: "OPTIONS",
      headers: {
        origin: "https://foreign.example",
        "access-control-request-method": "PUT",
      },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
