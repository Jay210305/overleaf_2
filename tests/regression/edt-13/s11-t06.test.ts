// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { parseVisualAst, serializeVisualAst } from "@latex-collab/latex";
import { FallbackNodesView } from "../../../apps/web/src/features/visual/fallback-node.js";

afterEach(() => {
  cleanup();
});

describe("S11-T06 Regression EDT-13: Literal Fallback Invariants", () => {
  it("EDT-13: Unsupported constructs (preamble, TikZ, verbatim) never mutate or discard raw TeX", () => {
    const raw = `\\documentclass{report}
\\usepackage{tikz}
\\begin{document}
\\section{Test}
\\begin{verbatim}
$ echo 'hello'
\\end{verbatim}
\\begin{tikzpicture}
  \\node {Root};
\\end{tikzpicture}
\\end{document}`;

    const doc = parseVisualAst(raw);

    render(createElement(FallbackNodesView, { nodes: doc.nodes, readOnly: true }));

    // Verify all literal fallbacks exist and contain their verbatim text
    const fallbacks = screen.getAllByTestId("visual-literal-fallback");
    expect(fallbacks.length).toBeGreaterThanOrEqual(3);

    // Verify serializeVisualAst returns identical raw source
    expect(serializeVisualAst(doc)).toBe(raw);
    expect(doc.rawSource).toBe(raw);
  });

  it("EDT-13: Arbitrary unknown macros and complex definitions remain verbatim literal", () => {
    const raw = `\\def\\myCustomMacro#1#2{\\textbf{#1}: #2}
\\newcommand{\\foo}[1]{\\emph{#1}}`;
    const doc = parseVisualAst(raw);

    render(createElement(FallbackNodesView, { nodes: doc.nodes, readOnly: true }));

    expect(screen.getAllByTestId("visual-literal-fallback")).toHaveLength(2);
    expect(serializeVisualAst(doc)).toBe(raw);
  });
});
