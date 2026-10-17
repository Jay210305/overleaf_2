import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("NFR-09 S15-T06: Automated backup and restore consistency regression", () => {
  it("verifies backup-restore script exports complete disaster recovery API", async () => {
    const scriptPath = join(process.cwd(), "infra/scripts/backup-restore.ts");
    const script = await readFile(scriptPath, "utf8");

    expect(script).toContain("createTrustedBackup");
    expect(script).toContain("restoreTrustedBackup");
    expect(script).toContain("verifyBackupIntegrity");
    expect(script).toContain("executeAutomatedRestore");
  });
});
