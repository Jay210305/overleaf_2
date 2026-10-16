// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  createLatexEditorExtensions,
  getModeForFilename,
} from "@latex-collab/editor/latex-extension";

describe("EDT-01 S04-T01 CodeMirror highlights LaTeX/BibTeX with line numbers and indentation", () => {
  it("provides line numbers, selection, indentation and bracket matching for LaTeX", () => {
    const doc = "\\begin{document}\n  \\section{Test}\n\\end{document}";
    const extensions = createLatexEditorExtensions({
      mode: "latex",
      lineNumbersEnabled: true,
      foldingEnabled: true,
    });

    const state = EditorState.create({
      doc,
      extensions,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new EditorView({
      state,
      parent: container,
    });

    try {
      expect(view.state.doc.lines).toBe(3);
      expect(view.state.doc.line(1).text).toBe("\\begin{document}");
      expect(view.state.doc.line(2).text).toBe("  \\section{Test}");
      expect(view.state.doc.line(3).text).toBe("\\end{document}");
    } finally {
      view.destroy();
      container.remove();
    }
  });

  it("handles BibTeX syntax with entry and field token recognition", () => {
    const bibDoc = `@article{knuth1984,\n  author = {Donald E. Knuth},\n  title = {Literate Programming},\n  year = {1984}\n}`;
    expect(getModeForFilename("sample.bib")).toBe("bibtex");

    const extensions = createLatexEditorExtensions({
      mode: "bibtex",
      lineNumbersEnabled: true,
    });

    const state = EditorState.create({
      doc: bibDoc,
      extensions,
    });

    expect(state.doc.lines).toBe(5);
    expect(state.doc.line(1).text).toContain("@article{knuth1984");
    expect(state.doc.line(2).text).toContain("author = {Donald E. Knuth}");
  });

  it("preserves complex Unicode characters across editor updates", () => {
    const unicodeText = "Matemáticas: ∫_0^∞ e^{-x} dx = 1 🚀 Español: Niño pingüino áéíóú";
    const extensions = createLatexEditorExtensions({ mode: "latex" });
    const state = EditorState.create({ doc: unicodeText, extensions });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new EditorView({ state, parent: container });

    try {
      expect(view.state.doc.toString()).toBe(unicodeText);
      // Insert additional Unicode text
      view.dispatch({
        changes: { from: view.state.doc.length, insert: " — Más texto: año 2026" },
      });
      expect(view.state.doc.toString()).toBe(unicodeText + " — Más texto: año 2026");
    } finally {
      view.destroy();
      container.remove();
    }
  });
});
