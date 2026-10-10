import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  projectNodes,
  projects,
  projectMembers,
  roles,
  compilers,
  projectStatuses,
} from "../../../packages/db/src/schema/core.js";

describe("PL-06 Relational constraints and domain invariants (S01-T01)", () => {
  it("enforces hierarchy and typing invariants on projectNodes", () => {
    const cols = getTableColumns(projectNodes);
    expect(cols.projectId.notNull).toBe(true);
    expect(cols.name.notNull).toBe(true);
    expect(cols.kind.notNull).toBe(true);
    expect(cols.contentKind.notNull).toBe(true);
    expect(cols.sizeBytes.notNull).toBe(true);
    expect(cols.parentId.notNull).toBe(false); // Root nodes have null parent
  });

  it("enforces project domain invariants on projects", () => {
    const cols = getTableColumns(projects);
    expect(cols.ownerId.notNull).toBe(true);
    expect(cols.title.notNull).toBe(true);
    expect(cols.compiler.notNull).toBe(true);
    expect(cols.status.notNull).toBe(true);
    expect(cols.currentRevision.notNull).toBe(true);
  });

  it("enforces valid roles and permissions on projectMembers", () => {
    const cols = getTableColumns(projectMembers);
    expect(cols.projectId.notNull).toBe(true);
    expect(cols.userId.notNull).toBe(true);
    expect(cols.role.notNull).toBe(true);
    expect(roles).toContain("OWNER");
    expect(roles).toContain("EDITOR");
    expect(roles).toContain("REVIEWER");
    expect(roles).toContain("VIEWER");
  });

  it("restricts compilers and project statuses to allowed domain enums", () => {
    expect(compilers).toContain("pdflatex");
    expect(compilers).toContain("xelatex");
    expect(compilers).toContain("lualatex");
    expect(compilers).toContain("latex");

    expect(projectStatuses).toContain("active");
    expect(projectStatuses).toContain("archived");
    expect(projectStatuses).toContain("trashed");
  });
});
