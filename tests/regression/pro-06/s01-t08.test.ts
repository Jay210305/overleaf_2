import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";

loadEnvFile(".env");

describe("PRO-06 Artifact Storage and Download (S01-T08)", () => {
  let adapter: S3StorageAdapter;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    adapter = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    await adapter.ensureBucketExists();
  });

  it("stores and generates download presigned URLs for build artifacts and logs", async () => {
    const jobId = randomUUID();
    const pdfKey = `artifacts/${jobId}/output.pdf`;
    const logKey = `artifacts/${jobId}/compile.log`;

    const samplePdf = Buffer.from("%PDF-1.7 mock output");
    const sampleLog = Buffer.from("Transcript of TeX run: 0 errors");

    await adapter.put(pdfKey, samplePdf, "application/pdf");
    await adapter.put(logKey, sampleLog, "text/plain");

    const pdfBytes = await adapter.get(pdfKey);
    expect(Buffer.from(pdfBytes).toString("utf8")).toBe("%PDF-1.7 mock output");

    const logBytes = await adapter.get(logKey);
    expect(Buffer.from(logBytes).toString("utf8")).toBe("Transcript of TeX run: 0 errors");

    const pdfDownloadUrl = await adapter.presign(pdfKey, "get", 600);
    expect(pdfDownloadUrl).toContain(pdfKey);

    await adapter.delete(pdfKey);
    await adapter.delete(logKey);
  });
});
