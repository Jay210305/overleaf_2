import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseVisualAst, type MathDisplayNode, type TableNode, type HeadingNode } from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../packages/editor/src/visual-patch.js";
import { applyFormulaPatch, applyTableCellPatch } from "../../packages/editor/src/visual-academic-patch.js";

function syncDocs(docA: Y.Doc, docB: Y.Doc): void {
  const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
  const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docB, updateA);
}

describe("S11-T09 Integration: Mixed Code and Visual Coediting", () => {
  it("two clients on supported regions converge cleanly", () => {
    const raw = `\\section{Background}
Initial introductory paragraph text.

\\[
  \\int_0^1 x dx = \\frac{1}{2}
\\]

\\begin{tabular}{|c|c|}
  Col1 & Col2 \\\\
  A & B \\\\
\\end{tabular}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(textB.toString()).toBe(raw);

    // Client A (Code mode): modifies intro paragraph
    textA.insert(raw.indexOf("paragraph"), "coedited ");

    // Client B (Visual mode): patches display formula
    const astB = parseVisualAst(textB.toString());
    const mathB = astB.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    expect(mathB).toBeDefined();

    const patchB = applyFormulaPatch(textB, {
      fileId: "paper.tex",
      mathNode: mathB,
      newFormula: "\\int_0^1 x^2 dx = \\frac{1}{3}",
      expectedFormulaHash: mathB.hash,
      baseDoc: docB,
    });
    expect(patchB.success).toBe(true);

    // Sync clients
    syncDocs(docA, docB);

    // Convergence assertion
    expect(textA.toString()).toBe(textB.toString());
    const converged = textA.toString();
    expect(converged).toContain("coedited paragraph");
    expect(converged).toContain("\\int_0^1 x^2 dx = \\frac{1}{3}");
    expect(converged).toContain("Col1 & Col2 \\\\");
  });

  it("incompatible simultaneous changes on same fragment trigger conflict rejection and preserve source", () => {
    const raw = `\\section{Original Title}
Paragraph text.`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Both clients get the initial AST for the heading
    const astA = parseVisualAst(textA.toString());
    const headingA = astA.nodes.find((n) => n.kind === "heading") as HeadingNode;

    const astB = parseVisualAst(textB.toString());
    const headingB = astB.nodes.find((n) => n.kind === "heading") as HeadingNode;

    // Client A in code mode edits the title: "Original Title" -> "Alpha Title"
    textA.delete(headingA.titleRange.start, headingA.title.length);
    textA.insert(headingA.titleRange.start, "Alpha Title");

    // Client A updates are synced to Client B's Y.Doc
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));

    // Client B now attempts to apply visual patch using stale fragment hash
    const patchB = createVisualPatch(
      "paper.tex",
      headingB.titleRange.start,
      headingB.titleRange.end,
      headingB.title,
      "Beta Title",
      docB
    );

    const resB = applyVisualPatch(textB, patchB);

    // Patch MUST be rejected due to stale fragment hash
    expect(resB.success).toBe(false);
    expect(resB.conflict).toBe(true);
    expect(resB.reason).toBe("STALE_FRAGMENT_HASH");

    // Client B's document contains Client A's edit and was NOT corrupted by stale patch
    expect(textB.toString()).toBe(`\\section{Alpha Title}
Paragraph text.`);
  });

  it("mixed visual table editing and code editor additions maintain document invariants", () => {
    const raw = `\\begin{tabular}{|l|r|}
  Item & Price \\\\
  Book & 15 \\\\
\\end{tabular}

\\begin{verbatim}
$ echo 'literal block'
\\end{verbatim}`;

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, raw);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A (Visual): edits price from 15 to 25
    const astA = parseVisualAst(textA.toString());
    const tableA = astA.nodes.find((n) => n.kind === "table") as TableNode;
    const resA = applyTableCellPatch(textA, {
      fileId: "paper.tex",
      tableNode: tableA,
      rowIndex: 1,
      colIndex: 1,
      newContent: "25",
      expectedCellHash: tableA.rows[1]?.cells[1]?.hash ?? "",
      baseDoc: docA,
    });
    expect(resA.success).toBe(true);

    // Client B (Code): appends comment at end of document
    textB.insert(textB.length, "\n% Author note: checked");

    syncDocs(docA, docB);

    expect(textA.toString()).toBe(textB.toString());
    const result = textA.toString();
    expect(result).toContain("Book & 25 \\\\");
    expect(result).toContain("\\begin{verbatim}\n$ echo 'literal block'\n\\end{verbatim}");
    expect(result.endsWith("% Author note: checked")).toBe(true);
  });
});
