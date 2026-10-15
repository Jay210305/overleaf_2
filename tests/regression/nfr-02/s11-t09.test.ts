import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  parseVisualAst,
  computeTextHash,
  type TableNode,
  type MathDisplayNode,
  type ParagraphNode,
} from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../../packages/editor/src/visual-patch.js";
import {
  applyTableCellPatch,
  applyFormulaPatch,
} from "../../../packages/editor/src/visual-academic-patch.js";

describe("S11-T09 Regression NFR-02: Five Simultaneous Editors Convergence", () => {
  it("NFR-02: Five simultaneous editors (code and visual) converge on identical content", () => {
    const initialDoc = `\\documentclass{article}
\\begin{document}
\\section{Initial Title}

\\paragraph{Abstract}
Initial abstract paragraph text.

\\begin{tabular}{|l|r|}
  Alpha & 10 \\\\
  Beta & 20 \\\\
\\end{tabular}

\\[
  f(x) = x^2
\\]

\\section{Conclusion}
Original closing remarks.
\\end{document}`;

    // Create 5 simultaneous client documents
    const clients = Array.from({ length: 5 }, () => {
      const doc = new Y.Doc();
      const text = doc.getText("content");
      return { doc, text };
    });

    // Seed client 0 with initial document
    clients[0]!.text.insert(0, initialDoc);
    const seedUpdate = Y.encodeStateAsUpdate(clients[0]!.doc);

    // Sync all clients to initial state
    for (let i = 1; i < 5; i++) {
      Y.applyUpdate(clients[i]!.doc, seedUpdate);
      expect(clients[i]!.text.toString()).toBe(initialDoc);
    }

    // Client 0 (Code Mode): updates Section 1 title directly in code
    const titleStart = clients[0]!.text.toString().indexOf("Initial Title");
    clients[0]!.text.delete(titleStart, "Initial Title".length);
    clients[0]!.text.insert(titleStart, "Distributed Collaborative Networks");

    // Client 1 (Visual Mode): edits Abstract paragraph text
    const ast1 = parseVisualAst(clients[1]!.text.toString());
    const abstractPara = ast1.nodes.find(
      (n) => n.kind === "paragraph" && n.text.includes("Initial abstract")
    ) as ParagraphNode;
    expect(abstractPara).toBeDefined();

    const patch1 = createVisualPatch(
      "doc.tex",
      abstractPara.range.start,
      abstractPara.range.end,
      abstractPara.raw,
      "\\paragraph{Abstract}\nConcurrent CRDT editing validated across multiple peers.\n\n",
      clients[1]!.doc
    );
    const res1 = applyVisualPatch(clients[1]!.text, patch1);
    expect(res1.success).toBe(true);

    // Client 2 (Visual Mode): edits Table cell [1, 1] ("20" -> "99")
    const ast2 = parseVisualAst(clients[2]!.text.toString());
    const table2 = ast2.nodes.find((n) => n.kind === "table") as TableNode;
    expect(table2).toBeDefined();

    const res2 = applyTableCellPatch(clients[2]!.text, {
      fileId: "doc.tex",
      tableNode: table2,
      rowIndex: 1,
      colIndex: 1,
      newContent: "99",
      expectedCellHash: table2.rows[1]?.cells[1]?.hash ?? "",
      baseDoc: clients[2]!.doc,
    });
    expect(res2.success).toBe(true);

    // Client 3 (Visual Mode): edits display formula
    const ast3 = parseVisualAst(clients[3]!.text.toString());
    const math3 = ast3.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    expect(math3).toBeDefined();

    const res3 = applyFormulaPatch(clients[3]!.text, {
      fileId: "doc.tex",
      mathNode: math3,
      newFormula: "f(x) = \\sum_{i=1}^n x_i^2 + \\lambda \\|x\\|_1",
      expectedFormulaHash: math3.hash,
      baseDoc: clients[3]!.doc,
    });
    expect(res3.success).toBe(true);

    // Client 4 (Code Mode): appends acknowledgments section before \end{document}
    const endDocIndex = clients[4]!.text.toString().indexOf("\\end{document}");
    clients[4]!.text.insert(
      endDocIndex,
      "\\section{Acknowledgments}\nWe thank the distributed systems engineering team.\n\n"
    );

    // Full-mesh exchange of all updates among all 5 peers
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (i !== j) {
          const update = Y.encodeStateAsUpdate(
            clients[i]!.doc,
            Y.encodeStateVector(clients[j]!.doc)
          );
          Y.applyUpdate(clients[j]!.doc, update);
        }
      }
    }

    // Verify all 5 clients have converged to 100% byte-for-byte identical content
    const reference = clients[0]!.text.toString();
    const referenceHash = computeTextHash(reference);

    for (let i = 1; i < 5; i++) {
      expect(clients[i]!.text.toString()).toBe(reference);
      expect(computeTextHash(clients[i]!.text.toString())).toBe(referenceHash);
    }

    // Assert that all 5 edits are intact in the converged document
    expect(reference).toContain("Distributed Collaborative Networks");
    expect(reference).toContain("Concurrent CRDT editing validated across multiple peers.");
    expect(reference).toContain("Beta & 99 \\\\");
    expect(reference).toContain("f(x) = \\sum_{i=1}^n x_i^2 + \\lambda \\|x\\|_1");
    expect(reference).toContain("We thank the distributed systems engineering team.");
    expect(reference.startsWith("\\documentclass{article}")).toBe(true);
    expect(reference.endsWith("\\end{document}")).toBe(true);
  });
});
