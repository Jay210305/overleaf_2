// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractArchive,
  findNodeIdByPath,
  importArchiveIntoProject,
  pickMainDocument,
  downloadProjectArchive,
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

  it("normalizes macOS decomposed names instead of dropping accented files", () => {
    const decomposed = "cafe\u0301.tex";
    const extracted = extractArchive(
      zipSync({ [decomposed]: new Uint8Array(strToU8("% caf\u00e9")) }),
    );
    expect(extracted.entries.map((entry) => entry.path)).toEqual(["caf\u00e9.tex"]);
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

  it("rejects archives exceeding the 200 MiB ZIP limit", () => {
    const fakeOversized = { length: 200 * 1024 * 1024 + 1 } as Uint8Array;
    expect(() => extractArchive(fakeOversized)).toThrow(
      "The selected archive exceeds the 200 MiB ZIP limit.",
    );
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

describe("Overleaf archive compatibility", () => {
  it("keeps binary EPS and TXT entries, flattens the root folder and transcodes legacy text", () => {
    const eps = new Uint8Array([0x25, 0x21, 0x50, 0x53, 0x2d, 0x41, 0x64, 0x6f, 0x62, 0x65]);
    // "café" encoded as Windows-1252, as older Overleaf projects were saved.
    const legacyTex = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    const extracted = extractArchive(
      zipSync({
        "paper/main.tex": legacyTex,
        "paper/notes.txt": new Uint8Array(strToU8("notes")),
        "paper/figures/logo.eps": eps,
        "paper/__MACOSX/._main.tex": new Uint8Array(strToU8("junk")),
      }),
    );

    expect(extracted.strippedRoot).toBe("paper");
    expect(extracted.entries.map((entry) => entry.path)).toEqual([
      "figures/logo.eps",
      "main.tex",
      "notes.txt",
    ]);
    const tex = extracted.entries.find((entry) => entry.path === "main.tex");
    expect(new TextDecoder().decode(tex!.bytes)).toBe("café\n");
    const logo = extracted.entries.find((entry) => entry.path === "figures/logo.eps");
    expect(Array.from(logo!.bytes)).toEqual(Array.from(eps));
    expect(extracted.entries.some((entry) => entry.path.includes("__MACOSX"))).toBe(false);
  });

  it("continues importing when a single entry is rejected", async () => {
    sessionStorage.setItem("csrf_token", "csrf-test-token");
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith(`/projects/${projectId}/nodes`) && method === "GET") {
        return Response.json({ projectId, treeVersion: 1, items: [] });
      }
      if (url.endsWith("/uploads/presign")) {
        const body = JSON.parse(String(init?.body)) as { fileName: string };
        if (body.fileName === "broken.eps") {
          return Response.json({ code: "UNSUPPORTED_CONTENT" }, { status: 422 });
        }
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
        { path: "main.tex", bytes: new Uint8Array(strToU8("\\documentclass{article}")) },
        { path: "broken.eps", bytes: new Uint8Array([0x25, 0x21, 0x50, 0x53]) },
      ],
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.path).toBe("broken.eps");
  });

  it("reports network or CORS error cleanly when direct storage upload fails", async () => {
    sessionStorage.setItem("csrf_token", "csrf-test-token");
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith(`/projects/${projectId}/nodes`) && method === "GET") {
        return Response.json({ projectId, treeVersion: 1, items: [] });
      }
      if (url.endsWith("/uploads/presign")) {
        return Response.json({
          uploadId: crypto.randomUUID(),
          url: "https://r2-storage.test/object",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url === "https://r2-storage.test/object") {
        throw new TypeError("Failed to fetch (CORS network error)");
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await importArchiveIntoProject({
      apiUrl,
      projectId,
      entries: [{ path: "main.tex", bytes: new Uint8Array(strToU8("\\documentclass{article}")) }],
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.path).toBe("main.tex");
    expect(result.failed[0]?.message).toContain(
      'Direct upload of "main.tex" to storage failed (network or CORS error)',
    );
  });
});

describe("project ZIP export", () => {
  it("packs nested folders, canonical text state and binary bytes into <title>.zip", async () => {
    const tree = {
      projectId,
      treeVersion: 4,
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          projectId,
          parentId: null,
          name: "figures",
          kind: "FOLDER" as const,
          mime: "application/x-directory",
          sizeBytes: 0,
          contentKind: "BINARY" as const,
          treeVersion: 4,
          deletedAt: null,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          projectId,
          parentId: null,
          name: "main.tex",
          kind: "FILE" as const,
          mime: "application/x-tex",
          sizeBytes: 12,
          contentKind: "TEXT" as const,
          treeVersion: 4,
          deletedAt: null,
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          projectId,
          parentId: "33333333-3333-4333-8333-333333333333",
          name: "logo.eps",
          kind: "FILE" as const,
          mime: "application/postscript",
          sizeBytes: 6,
          contentKind: "BINARY" as const,
          treeVersion: 4,
          deletedAt: null,
        },
      ],
    };
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\documentclass{article}");
    const updateBase64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    doc.destroy();
    const epsBytes = new Uint8Array([0x25, 0x21, 0x50, 0x53, 0x2d, 0x41]);

    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith(`/projects/${projectId}/nodes`)) return Response.json(tree);
      if (url.endsWith("/files/44444444-4444-4444-8444-444444444444/text"))
        return Response.json({ updateBase64 });
      if (url.endsWith("/files/55555555-5555-4555-8555-555555555555/download"))
        return new Response(epsBytes, { status: 200 });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    let captured: Blob | null = null;
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob | MediaSource) => {
        captured = blob as Blob;
        return "blob:mock";
      });
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      const result = await downloadProjectArchive({
        apiUrl,
        projectId,
        projectTitle: "Mi Tesis / 2026",
      });

      expect(result.fileName).toBe("Mi Tesis - 2026.zip");
      expect(result.fileCount).toBe(2);
      expect(result.folderCount).toBe(1);
      expect(captured).not.toBeNull();

      const bytes = new Uint8Array(await captured!.arrayBuffer());
      const entries = unzipSync(bytes);
      expect(Object.keys(entries).sort()).toEqual(["figures/", "figures/logo.eps", "main.tex"]);
      expect(new TextDecoder().decode(entries["main.tex"]!)).toBe("\\documentclass{article}");
      expect(Array.from(entries["figures/logo.eps"]!)).toEqual(Array.from(epsBytes));
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      click.mockRestore();
    }
  });
});
