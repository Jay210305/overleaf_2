import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  userViewSchema,
  projectViewSchema,
  projectListViewSchema,
  createProjectSchema,
  createNodeSchema,
} from "../../packages/contracts/src/index.js";

const root = resolve(import.meta.dirname, "../..");
const openapiPath = resolve(root, "docs/api/openapi.json");

describe("S01-T05 Zod DTOs and OpenAPI generation", () => {
  it("validates that database-only sensitive fields never reach userViewSchema", () => {
    const validUser = {
      id: randomUUID(),
      email: "user@example.test",
      displayName: "Valid User",
      avatarUrl: "https://example.test/avatar.png",
      createdAt: new Date().toISOString(),
    };

    expect(userViewSchema.parse(validUser)).toEqual(validUser);

    // Attempting to include passwordHash or tokenHash must fail schema parsing (strictObject rejects unknown)
    expect(() =>
      userViewSchema.parse({
        ...validUser,
        passwordHash: "$argon2id$v=19$secret",
      }),
    ).toThrow();

    expect(() =>
      userViewSchema.parse({
        ...validUser,
        tokenHash: "secret-token",
      }),
    ).toThrow();
  });

  it("validates projectViewSchema and projectListViewSchema DTO boundaries", () => {
    const validProject = {
      id: randomUUID(),
      ownerId: randomUUID(),
      title: "Sample Project",
      description: "My description",
      compiler: "pdflatex" as const,
      status: "active" as const,
      currentRevision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(projectViewSchema.parse(validProject)).toEqual(validProject);

    const validList = {
      items: [validProject],
      nextCursor: null,
    };
    expect(projectListViewSchema.parse(validList)).toEqual(validList);

    // Negative revision must fail
    expect(() =>
      projectViewSchema.parse({
        ...validProject,
        currentRevision: -1,
      }),
    ).toThrow();

    // Invalid compiler must fail
    expect(() =>
      projectViewSchema.parse({
        ...validProject,
        compiler: "bash",
      }),
    ).toThrow();
  });

  it("validates input mutation schemas reject unexpected properties", () => {
    const validCreate = {
      title: "New Project",
      compiler: "xelatex" as const,
    };
    expect(createProjectSchema.parse(validCreate)).toMatchObject(validCreate);

    // Reject unknown field in strict object
    expect(() =>
      createProjectSchema.parse({
        ...validCreate,
        isAdmin: true,
      }),
    ).toThrow();

    expect(() =>
      createNodeSchema.parse({
        name: "test.tex",
        kind: "FILE",
        arbitraryField: "attack",
      }),
    ).toThrow();
  });

  it("ensures docs/api/openapi.json exists, is valid OpenAPI 3.1.0 and covers API routes", () => {
    expect(existsSync(openapiPath)).toBe(true);
    const raw = readFileSync(openapiPath, "utf8");
    const spec = JSON.parse(raw) as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toContain("LatexWorkspace");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
    expect(Object.keys(spec.paths).some((path) => path.startsWith("/api/v1/"))).toBe(true);
  });
});
