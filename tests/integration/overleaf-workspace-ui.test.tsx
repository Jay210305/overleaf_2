// @vitest-environment jsdom
import { createElement } from "react";
import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CompilationView, ProjectNodeView } from "../../packages/contracts/src/index.js";
import {
  DocumentOutline,
  parseOutline,
} from "../../apps/web/src/features/editor/document-outline.js";
import { CompileLogPanel } from "../../apps/web/src/features/compilation/compile-log-panel.js";
import { FileTree } from "../../apps/web/src/features/files/file-tree.js";
import { PdfViewer } from "../../apps/web/src/features/pdf/pdf-viewer.js";
import {
  PresenceAvatars,
  collaboratorColor,
  collaboratorInitials,
} from "../../apps/web/src/features/collab/presence.js";
import { defaultLinkExpiry } from "../../apps/web/src/features/sharing/share-dialog.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const projectId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const texId = "33333333-3333-4333-8333-333333333333";

const texSource = `\\documentclass{article}
% \\section{Commented out heading}
\\section{Introduction}
Text.
\\subsection{Background}
More.
\\subsubsection{Details}
\\section*{Referencias}
`;

describe("document outline", () => {
  it("parses the heading hierarchy with line numbers and ignores comments", () => {
    const entries = parseOutline(texSource);
    expect(entries.map((entry) => [entry.level, entry.title, entry.line])).toEqual([
      [1, "Introduction", 3],
      [2, "Background", 5],
      [3, "Details", 7],
      [1, "Referencias", 8],
    ]);
  });

  it("strips inline markup from heading titles", () => {
    const [entry] = parseOutline("\\section{Una \\emph{tesis} de $x^2$}\n");
    expect(entry?.title).not.toContain("\\emph");
    expect(entry?.title).not.toContain("$");
    expect(entry?.title.startsWith("Una tesis de")).toBe(true);
    expect(parseOutline("")).toEqual([]);
    expect(parseOutline("\\section{\n")).toEqual([]);
  });

  it("jumps to the clicked heading and shows an empty state otherwise", () => {
    const onJumpToLine = vi.fn();
    const { rerender } = render(
      createElement(DocumentOutline, { source: texSource, onJumpToLine }),
    );
    fireEvent.click(screen.getByText("Background"));
    expect(onJumpToLine).toHaveBeenCalledWith(5);

    rerender(createElement(DocumentOutline, { source: "" }));
    expect(screen.getByText("No headings yet")).toBeTruthy();
  });
});

describe("compile console", () => {
  const job = {
    id: "44444444-4444-4444-8444-444444444444",
    projectId,
    sourceRevisionId: "55555555-5555-4555-8555-555555555555",
    status: "failed",
    startedAt: null,
    finishedAt: null,
    pdfAvailable: false,
    diagnostics: [
      {
        severity: "error",
        filePath: "chapters/intro.tex",
        line: 4,
        message: "Undefined control sequence \\foo",
      },
      { severity: "warning", message: "Reference `fig:1' undefined" },
    ],
  } as CompilationView;

  it("lists diagnostics and jumps to the reported source line", () => {
    const onJumpToDiagnostic = vi.fn();
    render(
      createElement(CompileLogPanel, {
        projectId,
        job,
        apiUrl: "/api/v1",
        onJumpToDiagnostic,
        onClose: vi.fn(),
      }),
    );
    expect(screen.getByRole("tab", { name: /Errors/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Go to line 4" }));
    expect(onJumpToDiagnostic).toHaveBeenCalledWith({
      filePath: "chapters/intro.tex",
      line: 4,
      message: "Undefined control sequence \\foo",
    });

    fireEvent.click(screen.getByRole("tab", { name: /Warnings/ }));
    expect(screen.getByText("Reference `fig:1' undefined")).toBeTruthy();
  });

  it("loads, searches and reports the raw compiler log", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("! Missing $ inserted.\nOverfull \\hbox badness 10000\n! Emergency stop.\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      createElement(CompileLogPanel, {
        projectId,
        job,
        apiUrl: "/api/v1",
        onJumpToDiagnostic: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Raw log/ }));
    await waitFor(() => expect(screen.getByText(/Emergency stop/)).toBeTruthy());
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/projects/${projectId}/compilations/${job.id}/artifacts/compile.log`,
      expect.objectContaining({ credentials: "include" }),
    );

    fireEvent.change(screen.getByLabelText("Search compiler log"), {
      target: { value: "overfull" },
    });
    const log = screen.getByText(/Overfull/);
    expect(log.textContent).not.toContain("Emergency stop");
  });

  it("explains a missing log artifact and empty diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    render(
      createElement(CompileLogPanel, {
        projectId,
        job: { ...job, diagnostics: [] },
        apiUrl: "/api/v1",
        onJumpToDiagnostic: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(screen.getByText("No errors. Your document compiled cleanly.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Raw log/ }));
    await waitFor(() =>
      expect(screen.getByText("This compilation produced no log file.")).toBeTruthy(),
    );
  });
});

function node(overrides: Partial<ProjectNodeView> & { id: string; name: string }): ProjectNodeView {
  return {
    projectId,
    parentId: null,
    kind: "FILE",
    mime: "application/x-tex",
    sizeBytes: 10,
    contentKind: "TEXT",
    ...overrides,
  } as ProjectNodeView;
}

function textState(source: string) {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, source);
  return {
    fileId: texId,
    updateBase64: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),
    stateVectorBase64: btoa(String.fromCharCode(...Y.encodeStateVector(doc))),
    persistedSeq: 1,
  };
}

describe("file tree actions", () => {
  const tree = {
    treeVersion: 3,
    items: [
      node({
        id: folderId,
        name: "chapters",
        kind: "FOLDER",
        contentKind: "BINARY",
        mime: "application/octet-stream",
      }),
      node({ id: texId, name: "main.tex", parentId: null }),
      node({
        id: "66666666-6666-4666-8666-666666666666",
        name: "figure.png",
        mime: "image/png",
        contentKind: "BINARY",
      }),
    ],
  };

  function stub(options: { onCreate?: (body: unknown) => Response } = {}) {
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/nodes") && (init?.method ?? "GET") === "GET") return Response.json(tree);
      if (url.endsWith("/nodes") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string };
        if (options.onCreate) return options.onCreate(body);
        return Response.json(
          node({ id: "77777777-7777-4777-8777-777777777777", name: body.name }),
          {
            status: 201,
          },
        );
      }
      if (url.includes("/text") && init?.method === "PUT") return Response.json({ ok: true });
      if (url.endsWith("/text")) return Response.json(textState("\\section{Hi}"));
      return Response.json({ items: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }

  it("offers rename, download, duplicate, main-document and delete in the row menu", async () => {
    stub();
    const onSetMainFile = vi.fn();
    render(
      createElement(FileTree, {
        projectId,
        apiUrl: "/api/v1",
        mainFileId: null,
        onSetMainFile,
      }),
    );
    await screen.findByRole("treeitem", { name: "main.tex (file)" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for main.tex" }));
    const menu = screen.getByRole("menu", { name: "Actions menu for main.tex" });
    expect(menu.textContent).toContain("Rename");
    expect(menu.textContent).toContain("Download");
    expect(menu.textContent).toContain("Duplicate");
    expect(menu.textContent).toContain("Set as main document");

    fireEvent.click(screen.getByRole("menuitem", { name: "Set main.tex as main document" }));
    expect(onSetMainFile).toHaveBeenCalledWith(expect.objectContaining({ id: texId }));
  });

  it("opens the rename dialog from the menu and sends If-Match", async () => {
    const fetcher = stub();
    render(createElement(FileTree, { projectId, apiUrl: "/api/v1" }));
    await screen.findByRole("treeitem", { name: "main.tex (file)" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for main.tex" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename main.tex" }));
    fireEvent.change(screen.getByLabelText("New name:"), { target: { value: "thesis.tex" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/projects/${projectId}/nodes/${texId}/rename`,
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ "if-match": '"3"' }),
        }),
      ),
    );
  });

  it("disables duplicating binary files and duplicates text files with their content", async () => {
    const fetcher = stub();
    render(createElement(FileTree, { projectId, apiUrl: "/api/v1" }));
    await screen.findByRole("treeitem", { name: "figure.png (file)" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for figure.png" }));
    const duplicate = screen.getByRole("menuitem", { name: "Duplicate figure.png" });
    expect(duplicate.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("menuitem", { name: /main document/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actions for figure.png" }));

    fireEvent.click(screen.getByRole("button", { name: "Actions for main.tex" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate main.tex" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/projects/${projectId}/files/77777777-7777-4777-8777-777777777777/text`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    await screen.findByText("Main", { exact: true }).catch(() => undefined);
  });

  it("moves a node by dropping it on a folder and highlights the drop target", async () => {
    const fetcher = stub();
    render(createElement(FileTree, { projectId, apiUrl: "/api/v1" }));
    const file = await screen.findByRole("treeitem", { name: "main.tex (file)" });
    const folder = screen.getByRole("treeitem", { name: "chapters (folder)" });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "move", dropEffect: "move" };

    fireEvent.dragStart(file, { dataTransfer });
    fireEvent.dragOver(folder, { dataTransfer });
    expect(folder.className).toContain("drop-target");
    fireEvent.drop(folder, { dataTransfer });

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        `/api/v1/projects/${projectId}/nodes/${texId}/move`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ targetParentId: folderId }),
        }),
      ),
    );
  });
});

describe("pdf viewer sizing", () => {
  it("sizes the page inside the pane and keeps page navigation in the document URL", () => {
    render(
      createElement(PdfViewer, {
        projectId,
        pdfUrl: "/api/v1/output.pdf",
        totalPages: 3,
      }),
    );
    const wrapper = screen.getByTestId("pdf-document") as HTMLElement;
    expect(wrapper.style.width).toBe("816px");
    expect(wrapper.style.height).toBe(`${816 * (297 / 210)}px`);
    const object = wrapper.querySelector("object") as HTMLObjectElement;
    expect(object.getAttribute("data")).toContain("#page=1");

    fireEvent.click(screen.getByTestId("page-next"));
    const navigated = screen
      .getByTestId("pdf-document")
      .querySelector("object") as HTMLObjectElement;
    expect(navigated.getAttribute("data")).toContain("#page=2");
    expect(screen.getByTestId("page-total").textContent).toBe("3");
  });
});

describe("presence avatars", () => {
  it("derives stable initials and colours per user", () => {
    expect(collaboratorInitials("Julio Centeno")).toBe("JC");
    expect(collaboratorInitials("julio")).toBe("JU");
    expect(collaboratorInitials("")).toBe("?");
    expect(collaboratorColor("user-a")).toBe(collaboratorColor("user-a"));
    expect(collaboratorColor("user-a")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("renders an avatar per collaborator and marks the current user", () => {
    render(
      createElement(PresenceAvatars, {
        currentUserId: "u1",
        collaborators: [
          { id: "u1", name: "Ana Lima", color: "#2f9e73" },
          { id: "u2", name: "Beto Ruiz", color: "#3f7fd1" },
        ],
      }),
    );
    expect(screen.getByTestId("presence-avatar-u1").textContent).toBe("AL");
    expect(screen.getByTestId("presence-avatar-u1").className).toContain("is-self");
    expect(screen.getByLabelText("Beto Ruiz")).toBeTruthy();
  });
});

describe("share link expiry default", () => {
  it("defaults to a future date accepted by the API", () => {
    const now = new Date("2026-10-20T10:00:00.000Z");
    const value = defaultLinkExpiry(now);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(value).getTime()).toBeGreaterThan(now.getTime());
  });
});
