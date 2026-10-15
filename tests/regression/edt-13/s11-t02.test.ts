import { describe, expect, it } from "vitest";
import {
  parseVisualAst,
  serializeVisualAst,
  computeTextHash,
} from "../../../packages/latex/src/visual-ast.js";

describe("S11-T02 Regression EDT-13: AST Projection & Range Map Invariants", () => {
  it("EDT-13 Invariant: Supported nodes project with precise character ranges", () => {
    const tex = `\\section{Methods}
We evaluate the \\textbf{proposed} approach using $x = \\alpha + \\beta$.
`;
    const doc = parseVisualAst(tex);
    expect(doc.hasErrors).toBe(false);

    for (const node of doc.nodes) {
      expect(tex.slice(node.range.start, node.range.end)).toBe(node.raw);
      expect(node.hash).toBe(computeTextHash(node.raw));
    }
  });

  it("EDT-13 Invariant: Unsupported syntax has visible non-destructive fallback", () => {
    const tex = `\\begin{tikzpicture}[scale=2]
  \\coordinate (A) at (0,0);
  \\draw (A) circle (1cm);
\\end{tikzpicture}`;

    const doc = parseVisualAst(tex);
    expect(doc.nodes.length).toBe(1);
    const node = doc.nodes[0]!;
    expect(node.kind).toBe("literalFallback");
    if (node.kind === "literalFallback") {
      expect(node.reason).toBe("tikz");
    }
    expect(node.raw).toBe(tex);
    expect(serializeVisualAst(doc)).toBe(tex);
  });

  it("EDT-13 Invariant: Parser failure falls back to controlled code mode without data loss", () => {
    const broken = "\\newcommand{\\foo[1]{unbalanced";
    const doc = parseVisualAst(broken);
    expect(serializeVisualAst(doc)).toBe(broken);
  });
});
