import { loadEnvFile } from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";

loadEnvFile(".env");

describe("PRO-05 Uploads and Content Integrity (S01-T08)", () => {
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

  const uploadCases = [
    { ext: "tex", mime: "application/x-tex", data: Buffer.from("\\documentclass{article}") },
    { ext: "bib", mime: "text/x-bibtex", data: Buffer.from("@article{key, title={Paper}}") },
    { ext: "sty", mime: "text/x-tex", data: Buffer.from("\\ProvidesPackage{custom}") },
    {
      ext: "png",
      mime: "image/png",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    { ext: "pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.7\n...") },
  ];

  it.each(uploadCases)(
    "preserves byte integrity and sha256 for permitted upload type .$ext ($mime)",
    async ({ ext, mime, data }) => {
      const projectId = randomUUID();
      const key = `projects/${projectId}/file.${ext}`;
      const expectedSha = createHash("sha256").update(data).digest("hex");

      const ref = await adapter.put(key, data, mime);
      expect(ref.sha256).toBe(expectedSha);
      expect(ref.sizeBytes).toBe(data.byteLength);
      expect(ref.mime).toBe(mime);

      const retrieved = await adapter.get(key);
      expect(Buffer.compare(Buffer.from(retrieved), data)).toBe(0);

      await adapter.delete(key);
    },
  );
});
