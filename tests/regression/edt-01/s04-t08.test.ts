// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createLatexEditorExtensions } from "../../../packages/editor/src/latex-extension.js";

describe("EDT-01 S04-T08 CodeMirror handles Unicode, Spanish accents, math, and emojis", () => {
  it("creates EditorState with Unicode text and preserves multi-byte glyphs and line counts", () => {
    const unicodeDoc = [
      "% Documento de prueba lingüística",
      "\\documentclass{article}",
      "\\begin{document}",
      "Acentos: á, é, í, ó, ú, ñ, ¿, ¡, lingüística",
      "Matemáticas: ∫_{0}^{∞} x^2 dx, ∀ x ∈ ℝ, ∑ ⊗ ∇",
      "Emojis: 🚀 🎉 🔬 ✍️",
      "\\end{document}",
    ].join("\n");

    const state = EditorState.create({
      doc: unicodeDoc,
      extensions: createLatexEditorExtensions({
        mode: "latex",
        theme: "light",
      }),
    });

    const view = new EditorView({ state });

    expect(view.state.doc.lines).toBe(7);
    expect(view.state.doc.line(4).text).toContain("lingüística");
    expect(view.state.doc.line(5).text).toContain("∫_{0}^{∞}");
    expect(view.state.doc.line(6).text).toContain("🚀 🎉");

    // Line offsets with multibyte characters
    const line4 = view.state.doc.line(4);
    expect(line4.number).toBe(4);
    expect(line4.length).toBeGreaterThan(20);

    view.destroy();
  });
});
