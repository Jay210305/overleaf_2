import { describe, expect, it } from "vitest";
import { parseVisualAst, serializeVisualAst, computeTextHash } from "@latex-collab/latex";
import { ROUND_TRIP_FIXTURES } from "../../../tests/integration/visual-round-trip.test.js";

describe("S11-T08 Regression EDT-13: 100 Round-Trip Fixtures Invariants", () => {
  it("EDT-13: All 100 fixtures produce 100% byte-identical serialized output without editing", () => {
    expect(ROUND_TRIP_FIXTURES.length).toBe(100);

    for (let i = 0; i < ROUND_TRIP_FIXTURES.length; i++) {
      const fixture = ROUND_TRIP_FIXTURES[i]!;
      const doc = parseVisualAst(fixture);
      const output = serializeVisualAst(doc);

      // Verify strict character-level equality
      expect(output).toBe(fixture);
      // Verify cryptographic SHA-256 hash invariance
      expect(computeTextHash(output)).toBe(computeTextHash(fixture));
    }
  });

  it("EDT-13: Complex academic documents with mixed preamble, TikZ, and math round-trip cleanly", () => {
    const complexPaper = `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{tikz}

\\begin{document}
\\title{Ultra-Dense Collaborative LaTeX Networks}
\\author{\\IEEEauthorblockN{Alice Engineer} \\and \\IEEEauthorblockN{Bob Scientist}}
\\maketitle

\\begin{abstract}
Collaborative editing requires strict CRDT synchronization and byte preservation.
\\end{abstract}

\\section{Introduction}
Real-time editors must not mutate raw TeX source when viewing in visual mode.
Consider the canonical field equations:
\\[
  \\mathbf{D} = \\varepsilon_0 \\mathbf{E} + \\mathbf{P}
\\]

\\begin{figure}[h]
  \\centering
  \\includegraphics[width=0.45\\textwidth]{topology.png}
  \\caption{Network topology graph}
  \\label{fig:topo}
\\end{figure}

\\begin{tikzpicture}
  \\draw[thick,->] (0,0) -- (2,2) node[anchor=south west] {Velocity vector};
\\end{tikzpicture}

\\section{Conclusion}
Fidelity is strictly preserved.
\\end{document}
`;

    const doc = parseVisualAst(complexPaper);
    const serialized = serializeVisualAst(doc);

    expect(serialized).toBe(complexPaper);
    expect(computeTextHash(serialized)).toBe(computeTextHash(complexPaper));
  });
});
