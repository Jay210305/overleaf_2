import { describe, expect, it } from "vitest";
import { allowsProjectAction } from "../../../packages/auth/src/project-policy.js";

describe("COL-03 S15-T08: Server-side authorization matrix audit regression", () => {
  it("strictly prohibits write operations for VIEWER and REVIEWER roles", () => {
    expect(allowsProjectAction("VIEWER", "EDIT")).toBe(false);
    expect(allowsProjectAction("REVIEWER", "EDIT")).toBe(false);
  });

  it("strictly reserves MANAGE_MEMBERS and DELETE actions exclusively to OWNER role", () => {
    expect(allowsProjectAction("VIEWER", "MANAGE_MEMBERS")).toBe(false);
    expect(allowsProjectAction("REVIEWER", "MANAGE_MEMBERS")).toBe(false);
    expect(allowsProjectAction("EDITOR", "MANAGE_MEMBERS")).toBe(false);
    expect(allowsProjectAction("OWNER", "MANAGE_MEMBERS")).toBe(true);
    expect(allowsProjectAction("OWNER", "DELETE")).toBe(true);
  });
});
