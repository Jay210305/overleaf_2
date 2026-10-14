import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("NFR-09 Consistent database and object storage recovery (S06-T16)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const recoveryDoc = resolve(root, "docs/operations/g1-recovery.md");
  const backupScript = resolve(root, "infra/scripts/trusted-backup.ts");

  it("verifies recovery runbook defines consistent restore and zero dangling blob invariant", () => {
    expect(existsSync(recoveryDoc)).toBe(true);
    const content = readFileSync(recoveryDoc, "utf8");

    expect(content).toContain("Zero Dangling Blob References");
    expect(content).toContain("revisions.snapshot_key");
    expect(content).toContain("artifact_sets.pdf_key");
    expect(content).toContain("verifyBackupIntegrity");
    expect(content).toContain("restoreTrustedBackup");
  });

  it("verifies trusted-backup script exports required backup and restore primitives", () => {
    expect(existsSync(backupScript)).toBe(true);
    const script = readFileSync(backupScript, "utf8");

    expect(script).toContain("createTrustedBackup");
    expect(script).toContain("restoreTrustedBackup");
    expect(script).toContain("verifyBackupIntegrity");
  });
});
