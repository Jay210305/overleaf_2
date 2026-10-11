import { loadEnvFile } from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import {
  S3StorageAdapter,
  StorageSecurityError,
  assertProjectKeyScope,
  validateKey,
} from "../../packages/storage/src/s3.js";

loadEnvFile(".env");

describe("S01-T08 Private S3 Adapter Integration", () => {
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

  it("stores and retrieves objects with matching SHA-256 and byte length", async () => {
    const projectId = randomUUID();
    const key = `projects/${projectId}/document.tex`;
    const content = Buffer.from(
      "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
    );
    const expectedSha = createHash("sha256").update(content).digest("hex");

    const putRef = await adapter.put(key, content, "application/x-tex");
    expect(putRef.key).toBe(key);
    expect(putRef.sizeBytes).toBe(content.byteLength);
    expect(putRef.sha256).toBe(expectedSha);
    expect(putRef.mime).toBe("application/x-tex");

    const headRef = await adapter.head(key);
    expect(headRef).not.toBeNull();
    expect(headRef?.key).toBe(key);
    expect(headRef?.sizeBytes).toBe(content.byteLength);
    expect(headRef?.sha256).toBe(expectedSha);

    const fetchedBytes = await adapter.get(key);
    expect(Buffer.from(fetchedBytes).toString("utf8")).toBe(content.toString("utf8"));

    await adapter.delete(key);
    const afterDelete = await adapter.head(key);
    expect(afterDelete).toBeNull();
  });

  it("generates presigned URLs for authorized keys", async () => {
    const projectId = randomUUID();
    const key = `projects/${projectId}/output.pdf`;
    const presignedGet = await adapter.presign(key, "get", 300);
    const presignedPut = await adapter.presign(key, "put", 300);

    expect(presignedGet).toContain("http");
    expect(presignedGet).toContain(key);
    expect(presignedPut).toContain("http");
    expect(presignedPut).toContain(key);
  });

  it("strictly enforces scoped project keys and denies cross-project access", () => {
    const projectA = randomUUID();
    const projectB = randomUUID();

    // Valid scope
    expect(() => assertProjectKeyScope(`projects/${projectA}/main.tex`, projectA)).not.toThrow();

    // Cross-project scope denied
    expect(() => assertProjectKeyScope(`projects/${projectB}/main.tex`, projectA)).toThrow(
      StorageSecurityError,
    );

    // Global / unauthorized prefix denied
    expect(() => assertProjectKeyScope(`system/passwords.txt`, projectA)).toThrow(
      StorageSecurityError,
    );
  });

  it("detects and rejects path traversal, illegal characters, and unauthorized prefixes", () => {
    expect(() => validateKey("../secret.txt")).toThrow(StorageSecurityError);
    expect(() => validateKey("/projects/123/file.tex")).toThrow(StorageSecurityError);
    expect(() => validateKey("projects/123/..\\secret")).toThrow(StorageSecurityError);
    expect(() => validateKey("projects/123/null\0byte")).toThrow(StorageSecurityError);
    expect(() => validateKey("unknown_bucket/file.txt")).toThrow(StorageSecurityError);
    expect(() => validateKey("")).toThrow(StorageSecurityError);
    expect(() => validateKey("   ")).toThrow(StorageSecurityError);
    expect(() => validateKey("projects/123//double-slash.tex")).toThrow(StorageSecurityError);
  });

  it("detects and rejects percent-encoded traversal and relative dot segments", () => {
    const proj = randomUUID();
    // Lowercase and uppercase percent-encoded dot-dot
    expect(() => validateKey(`projects/${proj}/%2e%2e/another/secret.tex`)).toThrow(
      StorageSecurityError,
    );
    expect(() => validateKey(`projects/${proj}/%2E%2E/secret.tex`)).toThrow(StorageSecurityError);

    // Percent-encoded backslash and null byte
    expect(() => validateKey(`projects/${proj}/%5csecret.tex`)).toThrow(StorageSecurityError);
    expect(() => validateKey(`projects/${proj}/%00secret.tex`)).toThrow(StorageSecurityError);

    // Relative dot segment
    expect(() => validateKey(`projects/${proj}/./secret.tex`)).toThrow(StorageSecurityError);

    // Double-encoded traversal and control characters
    expect(() => validateKey(`projects/${proj}/%252e%252e/another/secret.tex`)).toThrow(
      StorageSecurityError,
    );
    expect(() => validateKey(`projects/${proj}/%255csecret.tex`)).toThrow(StorageSecurityError);
    expect(() => validateKey(`projects/${proj}/%2500secret.tex`)).toThrow(StorageSecurityError);
    expect(() => validateKey(`projects/${proj}/%252f%252fsecret.tex`)).toThrow(
      StorageSecurityError,
    );
    expect(() => validateKey(`projects/${proj}/%252e/secret.tex`)).toThrow(StorageSecurityError);

    // Attempt to bypass assertProjectKeyScope using percent-encoded or double-encoded traversal must fail
    expect(() =>
      assertProjectKeyScope(`projects/${proj}/%2e%2e/another-project/secret.tex`, proj),
    ).toThrow(StorageSecurityError);
    expect(() =>
      assertProjectKeyScope(`projects/${proj}/%252e%252e/another-project/secret.tex`, proj),
    ).toThrow(StorageSecurityError);
  });

  it("handles head() cleanly without crashing when checking an uncreated bucket", async () => {
    const config = parseServerConfig(process.env);
    const nonExistentBucketAdapter = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: `non-existent-bucket-${randomUUID()}`,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

    const res = await nonExistentBucketAdapter.head("projects/p1/main.tex");
    expect(res).toBeNull();
  });
});
