// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  renderHook,
  act,
  waitFor,
} from "@testing-library/react";
import * as Y from "yjs";
import { computeTextHash } from "@latex-collab/latex";
import {
  EditorModeSwitch,
  ReadOnlyTextDocument,
  useEditorModeSwitch,
} from "../../apps/web/src/features/visual/mode-switch.js";
import { ProjectWorkspace } from "../../apps/web/src/features/projects/workspace.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S11-T07 Integration: Read-Only Code/Visual Mode Switching", () => {
  it("computes browser-compatible SHA-256 for source fragments", () => {
    expect(computeTextHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const unicode = "TeX π 😀 \ud800";
    expect(computeTextHash(unicode)).toBe(
      createHash("sha256").update(unicode, "utf8").digest("hex"),
    );
  });

  it("loads canonical text and switches the visible document without sending a mutation", async () => {
    const raw = "\\section{Intro}\nHello \\unknown{world}\n";
    const doc = new Y.Doc();
    doc.getText("content").insert(0, raw);
    const fileId = "0e33ca5c-f523-4fa5-95fb-ec3bea44c471";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fileId,
        updateBase64: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),
        stateVectorBase64: btoa(String.fromCharCode(...Y.encodeStateVector(doc))),
        persistedSeq: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(ReadOnlyTextDocument, { projectId: "project-1", fileId, apiUrl: "/api/v1" }),
    );
    await waitFor(() => expect(screen.getByTestId("source-code").textContent).toBe(raw));
    fireEvent.click(screen.getByTestId("mode-visual-btn"));
    expect(screen.getByText("Intro")).toBeDefined();
    expect(screen.getByTestId("visual-literal-fallback").textContent).toContain("\\unknown{world}");
    fireEvent.click(screen.getByTestId("mode-code-btn"));
    expect(screen.getByTestId("source-code").textContent).toBe(raw);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/projects/project-1/files/${fileId}/text`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("does not show source or mode controls when the text route denies access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    render(
      createElement(ReadOnlyTextDocument, {
        projectId: "project-1",
        fileId: "file-1",
        apiUrl: "/api/v1",
      }),
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("access denied"));
    expect(screen.queryByTestId("source-code")).toBeNull();
    expect(screen.queryByTestId("editor-mode-switch")).toBeNull();
  });

  it("opens the authorized text document from the actual project file tree", async () => {
    const projectId = "56d03d93-8bf3-4e5a-a924-0cce961c7ca1";
    const fileId = "5b3675db-bba8-4fb8-94da-ab9c6841df29";
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\section{Workspace}\n");
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/nodes")
          ? {
              projectId,
              treeVersion: 1,
              items: [
                {
                  id: fileId,
                  projectId,
                  parentId: null,
                  name: "main.tex",
                  kind: "FILE",
                  mime: "application/x-tex",
                  sizeBytes: 20,
                  contentKind: "TEXT",
                },
              ],
            }
          : url.endsWith("/text")
            ? {
                fileId,
                updateBase64: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),
                stateVectorBase64: btoa(String.fromCharCode(...Y.encodeStateVector(doc))),
                persistedSeq: 1,
              }
            : { id: projectId, title: "Workspace test" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(
        MemoryRouter,
        null,
        createElement(ProjectWorkspace, { projectId, apiUrl: "/api/v1" }),
      ),
    );
    const treeItem = await screen.findByRole("treeitem", { name: "main.tex (file)" });
    fireEvent.click(treeItem);
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("Workspace"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/projects/${projectId}/files/${fileId}/text`,
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });
  it("renders mode switch controls and notifies mode changes", () => {
    const onSelectMode = vi.fn();

    render(
      createElement(EditorModeSwitch, {
        mode: "code",
        onSelectMode,
        hasErrors: true,
      }),
    );

    const codeBtn = screen.getByTestId("mode-code-btn");
    const visualBtn = screen.getByTestId("mode-visual-btn");
    const errorDot = screen.getByTestId("mode-error-dot");

    expect(codeBtn.getAttribute("aria-checked")).toBe("true");
    expect(visualBtn.getAttribute("aria-checked")).toBe("false");
    expect(errorDot).toBeDefined();

    fireEvent.click(visualBtn);
    expect(onSelectMode).toHaveBeenCalledWith("visual");
  });

  it("leaves source bytes and hash 100% identical when opening and closing visual mode without edits", () => {
    const raw = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\section{Testing Mode Switching}
This is a document with display math:
\\[ \\sum_{k=1}^n k = \\frac{n(n+1)}{2} \\]
And unknown macro \\unsupportedCommand{arg} here.
\\end{document}`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);
    const initialHash = computeTextHash(raw);

    const onModeChange = vi.fn();
    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
        onModeChange,
      }),
    );

    expect(result.current.mode).toBe("code");

    // Switch to visual mode
    act(() => {
      result.current.setMode("visual", 42);
    });

    expect(result.current.mode).toBe("visual");
    expect(result.current.activeOffset).toBe(42);
    expect(result.current.ast).not.toBeNull();
    expect(result.current.verifySourceByteFidelity()).toBe(true);
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);

    // Switch back to code mode without making any edits
    act(() => {
      result.current.setMode("code", 42);
    });

    expect(result.current.mode).toBe("code");
    expect(result.current.verifySourceByteFidelity()).toBe(true);
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);
  });

  it("guarantees byte fidelity even on malformed or incomplete LaTeX source", () => {
    const raw = `\\section{Broken {Unclosed brace
\\begin{tabular}{|l|
no end tabular here`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);
    const initialHash = computeTextHash(raw);

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      }),
    );

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("visual");
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("code");
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);
  });

  it("tracks visual edit state when visual mutation occurs", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, "Simple paragraph.");

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      }),
    );

    act(() => {
      result.current.setMode("visual");
    });
    expect(result.current.hasUncommittedEdits).toBe(false);

    act(() => {
      result.current.recordVisualEdit();
    });
    expect(result.current.hasUncommittedEdits).toBe(true);
  });
});
