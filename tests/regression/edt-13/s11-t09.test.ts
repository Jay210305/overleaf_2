import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseVisualAst, type HeadingNode, type TableNode } from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../../packages/editor/src/visual-patch.js";
import { applyTableCellPatch } from "../../../packages/editor/src/visual-academic-patch.js";

describe("S11-T09 Regression EDT-13: Mixed Coediting Convergence Invariants", () => {
  it("EDT-13: Visual node edit converges with simultaneous code editor typing", () => {
    const raw = `\\section{Original}
Paragraph content for testing.`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A in visual mode: edits heading to "Revised Section"
    const astA = parseVisualAst(textA.toString());
    const headingA = astA.nodes.find((n) => n.kind === "heading") as HeadingNode;
    const patchA = createVisualPatch(
      "test.tex",
      headingA.titleRange.start,
      headingA.titleRange.end,
      headingA.title,
      "Revised Section",
      docA
    );
    applyVisualPatch(textA, patchA);

    // Client B in code mode: types additional content at paragraph end
    const appendPos = textB.toString().indexOf("testing.") + "testing.".length;
    textB.insert(appendPos, " Additional verified details.");

    // Exchange Yjs updates
    const uA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const uB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    Y.applyUpdate(docA, uB);
    Y.applyUpdate(docB, uA);

    // Both documents must converge to identical text
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toBe(`\\section{Revised Section}
Paragraph content for testing. Additional verified details.`);
  });

  it("EDT-13: Table edits converge with concurrent TikZ block additions", () => {
    const raw = `\\begin{tabular}{|c|}
  Cell 1 \\\\
\\end{tabular}

\\section{Diagrams}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A (Visual): updates cell content
    const astA = parseVisualAst(textA.toString());
    const tableA = astA.nodes.find((n) => n.kind === "table") as TableNode;
    applyTableCellPatch(textA, {
      fileId: "test.tex",
      tableNode: tableA,
      rowIndex: 0,
      colIndex: 0,
      newContent: "Modified Cell 1",
      expectedCellHash: tableA.rows[0]?.cells[0]?.hash ?? "",
      baseDoc: docA,
    });

    // Client B (Code): adds TikZ block under diagrams section
    textB.insert(
      textB.length,
      "\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,0);\n\\end{tikzpicture}"
    );

    const uA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const uB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    Y.applyUpdate(docA, uB);
    Y.applyUpdate(docB, uA);

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("Modified Cell 1");
    expect(textA.toString()).toContain("\\begin{tikzpicture}");
  });
});
