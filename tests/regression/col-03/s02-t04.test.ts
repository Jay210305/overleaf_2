import { describe, expect, it } from "vitest";
import { allowsProjectAction, projectActions } from "../../../packages/auth/src/project-policy.js";
import type { Role } from "@latex-collab/contracts";

describe("COL-03 pure project role policy", () => {
  const matrix: Record<Role, string[]> = {
    OWNER: [...projectActions],
    EDITOR: [
      "READ",
      "EDIT",
      "COMPILE",
      "COMMENT",
      "CHAT",
      "SUGGEST",
      "REVIEW",
      "RESTORE",
      "EXPORT",
    ],
    REVIEWER: ["READ", "COMMENT", "CHAT", "SUGGEST"],
    VIEWER: ["READ"],
  };

  it("enforces each documented action by role and denies unknown actions", () => {
    for (const role of Object.keys(matrix) as Role[]) {
      for (const action of projectActions) {
        expect(allowsProjectAction(role, action), `${role} ${action}`).toBe(
          matrix[role].includes(action),
        );
      }
    }
    expect(allowsProjectAction(null, "READ")).toBe(false);
    expect(allowsProjectAction("OWNER", "UNSUPPORTED")).toBe(false);
    expect(allowsProjectAction("OWNER", null)).toBe(false);
  });

  it("requires explicit capability for reviewer/viewer compile and source export", () => {
    for (const role of ["REVIEWER", "VIEWER"] as const) {
      expect(allowsProjectAction(role, "COMPILE")).toBe(false);
      expect(allowsProjectAction(role, "EXPORT")).toBe(false);
      expect(allowsProjectAction(role, "COMPILE", { compileAllowed: true })).toBe(true);
      expect(allowsProjectAction(role, "EXPORT", { exportAllowed: true })).toBe(true);
      expect(allowsProjectAction(role, "EDIT", { compileAllowed: true, exportAllowed: true })).toBe(
        false,
      );
    }
  });

  it("does not mutate a caller's capability object", () => {
    const capabilities = Object.freeze({ compileAllowed: true, exportAllowed: false });
    expect(allowsProjectAction("REVIEWER", "COMPILE", capabilities)).toBe(true);
    expect(capabilities).toEqual({ compileAllowed: true, exportAllowed: false });
  });
});
