import { describe, expect, it } from "vitest";
import {
  roleSchema,
  compilerSchema,
  projectStatusSchema,
  nodeKindSchema,
  contentKindSchema,
} from "../../../packages/contracts/src/index.js";

describe("PL-06 Typed contracts domain enums (S01-T05)", () => {
  it("strictly validates allowed roles", () => {
    expect(roleSchema.safeParse("OWNER").success).toBe(true);
    expect(roleSchema.safeParse("EDITOR").success).toBe(true);
    expect(roleSchema.safeParse("REVIEWER").success).toBe(true);
    expect(roleSchema.safeParse("VIEWER").success).toBe(true);

    expect(roleSchema.safeParse("ADMIN").success).toBe(false);
    expect(roleSchema.safeParse("").success).toBe(false);
  });

  it("strictly validates allowed compilers", () => {
    expect(compilerSchema.safeParse("pdflatex").success).toBe(true);
    expect(compilerSchema.safeParse("xelatex").success).toBe(true);
    expect(compilerSchema.safeParse("lualatex").success).toBe(true);
    expect(compilerSchema.safeParse("latex").success).toBe(true);

    expect(compilerSchema.safeParse("shell").success).toBe(false);
  });

  it("strictly validates node and content kinds", () => {
    expect(nodeKindSchema.safeParse("FILE").success).toBe(true);
    expect(nodeKindSchema.safeParse("FOLDER").success).toBe(true);
    expect(nodeKindSchema.safeParse("SYMLINK").success).toBe(false);

    expect(contentKindSchema.safeParse("TEXT").success).toBe(true);
    expect(contentKindSchema.safeParse("BINARY").success).toBe(true);
    expect(contentKindSchema.safeParse("EXECUTABLE").success).toBe(false);
  });

  it("strictly validates project status", () => {
    expect(projectStatusSchema.safeParse("active").success).toBe(true);
    expect(projectStatusSchema.safeParse("archived").success).toBe(true);
    expect(projectStatusSchema.safeParse("trashed").success).toBe(true);
    expect(projectStatusSchema.safeParse("deleted").success).toBe(false);
  });
});
