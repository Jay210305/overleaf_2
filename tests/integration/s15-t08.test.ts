import { describe, expect, it } from "vitest";
import { allowsProjectAction } from "../../packages/auth/src/project-policy.js";

describe("S15-T08: Audit delivered API, WSS, files, and integrations (COL-03, PL-07)", () => {
  it("enforces strict role-based permission boundaries across all project roles (COL-03)", () => {
    // VIEWER permissions: read only
    expect(allowsProjectAction("VIEWER", "READ")).toBe(true);
    expect(allowsProjectAction("VIEWER", "EDIT")).toBe(false);
    expect(allowsProjectAction("VIEWER", "COMMENT")).toBe(false);
    expect(allowsProjectAction("VIEWER", "MANAGE_MEMBERS")).toBe(false);

    // REVIEWER permissions: read, comment, cannot edit or manage members
    expect(allowsProjectAction("REVIEWER", "READ")).toBe(true);
    expect(allowsProjectAction("REVIEWER", "COMMENT")).toBe(true);
    expect(allowsProjectAction("REVIEWER", "EDIT")).toBe(false);
    expect(allowsProjectAction("REVIEWER", "MANAGE_MEMBERS")).toBe(false);

    // EDITOR permissions: read, comment, edit, cannot manage members
    expect(allowsProjectAction("EDITOR", "READ")).toBe(true);
    expect(allowsProjectAction("EDITOR", "COMMENT")).toBe(true);
    expect(allowsProjectAction("EDITOR", "EDIT")).toBe(true);
    expect(allowsProjectAction("EDITOR", "MANAGE_MEMBERS")).toBe(false);

    // OWNER permissions: all actions permitted
    expect(allowsProjectAction("OWNER", "READ")).toBe(true);
    expect(allowsProjectAction("OWNER", "COMMENT")).toBe(true);
    expect(allowsProjectAction("OWNER", "EDIT")).toBe(true);
    expect(allowsProjectAction("OWNER", "MANAGE_MEMBERS")).toBe(true);
    expect(allowsProjectAction("OWNER", "DELETE")).toBe(true);
  });

  it("verifies compiler trust boundary and prevents unverified untrusted execution (PL-07)", async () => {
    const { validatePublicCompilationPolicy } = await import(
      "../../apps/jobs/src/compilation/public-policy.js"
    );

    // Untrusted compile with shell escape must be forbidden
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: true,
        networkDisabled: true,
        noShellEscape: false, // Shell escape forbidden!
      }),
    ).toThrow(/SHELL_ESCAPE_FORBIDDEN/);

    // Untrusted compile with network enabled must be forbidden
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: true,
        networkDisabled: false, // Network must be disabled!
        noShellEscape: true,
      }),
    ).toThrow(/NETWORK_ISOLATION_REQUIRED/);
  });
});
