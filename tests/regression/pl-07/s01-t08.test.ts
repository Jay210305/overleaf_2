import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  StorageSecurityError,
  assertProjectKeyScope,
  validateKey,
} from "../../../packages/storage/src/s3.js";

describe("PL-07 Object Storage Boundaries and Scope Isolation (S01-T08)", () => {
  it("denies access when a tenant attempts to read or presign an object belonging to another project", () => {
    const tenantProjectId = randomUUID();
    const victimProjectId = randomUUID();

    const victimKey = `projects/${victimProjectId}/secret_draft.tex`;

    expect(() => assertProjectKeyScope(victimKey, tenantProjectId)).toThrow(StorageSecurityError);
    expect(() => assertProjectKeyScope(victimKey, tenantProjectId)).toThrow(
      /Access denied: key .* is outside authorized scope/i,
    );
  });

  it("denies access to paths with traversal sequences or invalid prefixes", () => {
    const projectId = randomUUID();

    const traversalKeys = [
      `projects/${projectId}/../../../etc/passwd`,
      `/projects/${projectId}/main.tex`,
      `projects/${projectId}/..\\config`,
      `projects/${projectId}/foo\0bar.tex`,
      `internal_system_secrets/${projectId}/data.bin`,
    ];

    for (const key of traversalKeys) {
      expect(() => validateKey(key)).toThrow(StorageSecurityError);
    }
  });
});
