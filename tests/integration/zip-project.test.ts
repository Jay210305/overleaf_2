// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractArchive,
  findNodeIdByPath,
  importArchiveIntoProject,
  pickMainDocument,
} from "../../apps/web/src/features/files/zip.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const apiUrl = "http://api.test/api/v1";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function archive(files: Record<string, string>): Uint8Array {
  // jsdom's TextEncoder returns a Uint8Array from another realm, which the
  // fflate instance check rejects; copy it into the current realm first.
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, body]) => [name, new Uint8Array(strToU8(body))]),
    ),
    { level: 6 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("project ZIP extraction", () => {
  it("strips the common root folder and drops unsupported or unsafe entries", () => {
    const extracted = extractArchive(
      archive({
        "paper/main.tex": "\\documentclass{article}",
        "paper/sections/intro.tex": "\\section{Intro}",
        "paper/refs.bib": "@book{sample,title={A}}",
        "paper/README.md": "# unsupported",
        "../escape.tex": "\\evil",
      }),
    );

    expect(extracted.strippedRoot).toBe("paper");
    expect(extracted.entries.map((entry) => entry.path)).toEqual([
      "main.tex",
      "refs.bib",
      "sections/intro.tex",
    ]);
    expect(extracted.skipped.some((path) => path.endsWith("README.md"))).toBe(true);
    expect(extracted.entries.some((entry) => entry.path.includes(".."))).toBe(false);
  });

  it("rejects archives without any supported project file", () => {
    expect(() => extractArchive(archive({ "notes.md": "just notes" }))).toThrow(
      /No supported project files/i,
    );
  });

  it("prefers a root main.tex and otherwise the shallowest TeX document", () => {
    expect(
      pickMainDocument([
        { path: "appendix/chapter.tex", bytes: new Uint8Array() },
        { path: "main.tex", bytes: new Uint8Array() },
      ]),
    ).toBe("main.tex");
    expect(
      pickMainDocument([
        { path: "chapters/one/intro.tex", bytes: new Uint8Array() },
        { path: "paper.tex", bytes: new Uint8Array() },
      ]),
    ).toBe("paper.tex");
    expect(pickMainDocument([{ path: "refs.bib", bytes: new Uint8Array() }])).toBeNull();
  });
});

describe("project ZIP import", () => {
  it("creates missing folders and uploads every entry through the authorized flow", async () => {
    sessionStorage.setItem("csrf_token", "csrf-test-token");
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    const presigns: Array<{ fileName: string; parentId: string | null }> = [];
    const completes: Array<{ uploadId: string; sha256: string }> = [];

    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, method, body });

      if (url.endsWith(`/projects/${projectId}/nodes`) && method === "GET") {
        return Response.json({ projectId, treeVersion: 1, items: [] });
      }
      if (url.endsWith(`/projects/${projectId}/nodes`) && method === "POST") {
        return Response.json(
          {
            id: body.name === "sections" ? "folder-sections" : "folder-other",
            projectId,
            parentId: body.parentId,
            name: body.name,
            kind: "FOLDER",
            mime: "application/x-directory",
            sizeBytes: 0,
            contentKind: "BINARY",
            treeVersion: 2,
            deletedAt: null,
          },
          { status: 201 },
        );
      }
      if (url.endsWith("/uploads/presign")) {
        presigns.push({ fileName: body.fileName, parentId: body.parentId });
        return Response.json({
          uploadId: crypto.randomUUID(),
          url: "https://storage.test/object",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url === "https://storage.test/object") {
        return new Response(null, { status: 200 });
      }
      if (url.endsWith("/uploads/complete")) {
        completes.push(body);
        return Response.json({ id: crypto.randomUUID() }, { status: 201 });
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const extracted = extractArchive(
      archive({
        "paper/main.tex": "\\documentclass{article}",
        "paper/sections/intro.tex": "\\section{Intro}",
        "paper/refs.bib": "@book{sample,title={A}}",
      }),
    );
    const progress: string[] = [];
    const result = await importArchiveIntoProject({
      apiUrl,
      projectId,
      csrfToken: "csrf-test-token",
      entries: extracted.entries,
      onProgress: (event) => progress.push(event.phase),
    });

    expect(result.uploaded).toBe(3);
    expect(result.skippedExisting).toBe(0);
    expect(progress.at(-1)).toBe("done");

    const folderPosts = requests.filter(
      (request) => request.method === "POST" && request.url.endsWith("/nodes"),
    );
    expect(folderPosts).toHaveLength(1);
    expect(folderPosts[0]?.body).toMatchObject({ name: "sections", parentId: null });

    expect(presigns).toEqual(
      expect.arrayContaining([
        { fileName: "main.tex", parentId: null },
        { fileName: "refs.bib", parentId: null },
        { fileName: "intro.tex", parentId: "folder-sections" },
      ]),
    );
    expect(completes).toHaveLength(3);
    expect(completes[0]?.sha256).toBe(sha256(strToU8("\\documentclass{article}")));
  });

  it("skips files that already exist at the destination", async () => {
    sessionStorage.setItem("csrf_token", "csrf-test-token");
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith(`/projects/${projectId}/nodes`) && method === "GET") {
        return Response.json({
          projectId,
          treeVersion: 1,
          items: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              projectId,
              parentId: null,
              name: "main.tex",
              kind: "FILE",
              mime: "application/x-tex",
              sizeBytes: 10,
              contentKind: "TEXT",
              treeVersion: 1,
              deletedAt: null,
            },
          ],
        });
      }
      if (url.endsWith("/uploads/presign")) {
        return Response.json({
          uploadId: crypto.randomUUID(),
          url: "https://storage.test/object",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url === "https://storage.test/object") return new Response(null, { status: 200 });
      if (url.endsWith("/uploads/complete")) {
        return Response.json({ id: crypto.randomUUID() }, { status: 201 });
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await importArchiveIntoProject({
      apiUrl,
      projectId,
      entries: [
        { path: "main.tex", bytes: strToU8("new body") },
        { path: "refs.bib", bytes: strToU8("@book{x}") },
      ],
    });

    expect(result.uploaded).toBe(1);
    expect(result.skippedExisting).toBe(1);
  });

  it("resolves a nested node path for main document selection", () => {
    const nodes = [
      {
        id: "root-file",
        projectId,
        parentId: null,
        name: "main.tex",
        kind: "FILE" as const,
        mime: "application/x-tex",
        sizeBytes: 1,
        contentKind: "TEXT" as const,
        treeVersion: 1,
        deletedAt: null,
      },
      {
        id: "folder",
        projectId,
        parentId: null,
        name: "paper",
        kind: "FOLDER" as const,
        mime: "application/x-directory",
        sizeBytes: 0,
        contentKind: "BINARY" as const,
        treeVersion: 1,
        deletedAt: null,
      },
      {
        id: "nested-file",
        projectId,
        parentId: "folder",
        name: "thesis.tex",
        kind: "FILE" as const,
        mime: "application/x-tex",
        sizeBytes: 1,
        contentKind: "TEXT" as const,
        treeVersion: 1,
        deletedAt: null,
      },
    ];
    expect(findNodeIdByPath(nodes, "paper/thesis.tex")).toBe("nested-file");
    expect(findNodeIdByPath(nodes, "missing.tex")).toBeNull();
  });
});
