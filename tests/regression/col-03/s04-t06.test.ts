import { describe, expect, it } from "vitest";
import {
  canEdit,
  isReadOnly,
  canCompile,
  canManageMembers,
} from "../../../apps/web/src/features/editor/permissions.js";
import { assertCanEditProject } from "../../../apps/api/src/modules/files/version-guard.js";

describe("COL-03 S04-T06 Role permission enforcement", () => {
  it("enforces OWNER and EDITOR write permissions, blocking VIEWER and REVIEWER", () => {
    expect(canEdit("OWNER")).toBe(true);
    expect(canEdit("EDITOR")).toBe(true);
    expect(canEdit("VIEWER")).toBe(false);
    expect(canEdit("REVIEWER")).toBe(false);

    expect(isReadOnly("OWNER")).toBe(false);
    expect(isReadOnly("EDITOR")).toBe(false);
    expect(isReadOnly("VIEWER")).toBe(true);
    expect(isReadOnly("REVIEWER")).toBe(true);

    expect(canCompile("OWNER")).toBe(true);
    expect(canCompile("EDITOR")).toBe(true);
    expect(canCompile("VIEWER")).toBe(false);

    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("EDITOR")).toBe(false);

    expect(() => assertCanEditProject("OWNER")).not.toThrow();
    expect(() => assertCanEditProject("EDITOR")).not.toThrow();
    expect(() => assertCanEditProject("VIEWER")).toThrow();
    expect(() => assertCanEditProject("REVIEWER")).toThrow();
  });
});
