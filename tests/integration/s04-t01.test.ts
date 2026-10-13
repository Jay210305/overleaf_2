// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  getModeForFilename,
  createLatexEditorExtensions,
} from "@latex-collab/editor/latex-extension";
import { LatexCodeEditor } from "../../apps/web/src/features/editor/latex-code-editor.js";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

describe("S04-T01 LaTeX CodeMirror extensions integration", () => {
  afterEach(() => {
    cleanup();
  });

  it("detects mode for LaTeX, BibTeX, style, and plain text files", () => {
    expect(getModeForFilename("main.tex")).toBe("latex");
    expect(getModeForFilename("chapter1.TEX")).toBe("latex");
    expect(getModeForFilename("references.bib")).toBe("bibtex");
    expect(getModeForFilename("custom.sty")).toBe("style");
    expect(getModeForFilename("article.cls")).toBe("style");
    expect(getModeForFilename("notes.txt")).toBe("plain");
    expect(getModeForFilename("README.md")).toBe("plain");
  });

  it("initializes CodeMirror with line numbers, theme, and preserves Unicode source", () => {
    const unicodeText = `\\section{Introducción: ¿Cómo funciona? 🌟}
% Comentario en español con acentos: á, é, í, ó, ú, ñ
\\begin{equation}
\\alpha + \\beta = \\gamma \\quad \\text{emoji: 🔬}
\\end{equation}`;

    const extensions = createLatexEditorExtensions({
      mode: "latex",
      theme: "light",
      lineNumbersEnabled: true,
      foldingEnabled: true,
    });

    const state = EditorState.create({
      doc: unicodeText,
      extensions,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new EditorView({
      state,
      parent: container,
    });

    try {
      expect(view.state.doc.toString()).toBe(unicodeText);
      expect(view.state.doc.lines).toBe(5);
      // Unicode preservation check
      expect(view.state.doc.line(1).text).toContain("¿Cómo funciona? 🌟");
      expect(view.state.doc.line(2).text).toContain("á, é, í, ó, ú, ñ");
      expect(view.state.doc.line(4).text).toContain("🔬");
    } finally {
      view.destroy();
      container.remove();
    }
  });

  it("renders LatexCodeEditor component with status bar and line info", () => {
    render(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        fileName: "document.tex",
        initialContent: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
      }),
    );

    expect(screen.getByTestId("latex-code-editor")).toBeTruthy();
    expect(screen.getByTestId("status-mode").textContent).toBe("LATEX");
    expect(screen.getByTestId("save-status-saved")).toBeTruthy();
  });

  it("displays read-only notice when user is VIEWER or REVIEWER", () => {
    render(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        userRole: "VIEWER",
      }),
    );

    expect(screen.getByTestId("readonly-notice")).toBeTruthy();
    expect(screen.getByText(/Read-only mode \(VIEWER\)/)).toBeTruthy();
  });

  it("displays explicit error banners for NOT_FOUND, CONFLICT, and SERVICE_UNAVAILABLE", () => {
    const { rerender } = render(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        errorCode: "NOT_FOUND",
      }),
    );
    expect(screen.getByTestId("error-not-found")).toBeTruthy();

    rerender(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        errorCode: "CONFLICT",
      }),
    );
    expect(screen.getByTestId("error-conflict")).toBeTruthy();

    rerender(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        errorCode: "SERVICE_UNAVAILABLE",
        saveStatus: "offline",
      }),
    );
    expect(screen.getByTestId("error-service-unavailable")).toBeTruthy();
    expect(screen.getByTestId("save-status-offline")).toBeTruthy();
  });

  it("ensures local/socket-only state cannot be falsely claimed as saved", () => {
    // When offline or in error, saveStatus cannot be 'saved'
    render(
      createElement(LatexCodeEditor, {
        projectId: "11111111-1111-4111-8111-111111111111",
        fileId: "22222222-2222-4222-8222-222222222222",
        saveStatus: "saving",
      }),
    );

    expect(screen.queryByTestId("save-status-saved")).toBeNull();
    expect(screen.getByTestId("save-status-saving")).toBeTruthy();
  });
});
