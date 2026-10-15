import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseVisualAst, type TableNode, type MathDisplayNode } from "@latex-collab/latex";
import {
  applyTableCellPatch,
  applyFormulaPatch,
} from "../../../packages/editor/src/visual-academic-patch.js";

describe("S11-T10 Regression EDT-13: Simple Table and Formula Editing Invariants", () => {
  it("EDT-13: Table edits mutate only cell content and preserve delimiters and other cells", () => {
    const raw = `\\begin{tabular}{|r|l|}
  100 & Meters \\\\
  200 & Seconds \\\\
\\end{tabular}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const tableNode = docAst.nodes.find((n) => n.kind === "table") as TableNode;

    const row1 = tableNode.rows[1];
    const cell = row1?.cells[0];
    if (!cell) throw new Error("cell not found");
    const res = applyTableCellPatch(yText, {
      fileId: "paper.tex",
      tableNode,
      rowIndex: 1,
      colIndex: 0,
      newContent: "300",
      expectedCellHash: cell.hash,
      baseDoc: yDoc,
    });

    expect(res.success).toBe(true);
    expect(yText.toString()).toBe(`\\begin{tabular}{|r|l|}
  100 & Meters \\\\
  300 & Seconds \\\\
\\end{tabular}`);
  });

  it("EDT-13: Formula edits preserve display delimiters and document preamble/postamble", () => {
    const raw = `Prefix text
\\[
  a^2 + b^2 = c^2
\\]
Suffix text`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const mathNode = docAst.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;

    const res = applyFormulaPatch(yText, {
      fileId: "paper.tex",
      mathNode,
      newFormula: "x^2 + y^2 = z^2",
      expectedFormulaHash: "",
      baseDoc: yDoc,
    });

    expect(res.success).toBe(true);
    const updated = yText.toString();
    expect(updated.startsWith("Prefix text")).toBe(true);
    expect(updated.endsWith("Suffix text")).toBe(true);
    expect(updated).toContain("\\[\n  x^2 + y^2 = z^2\n\\]");
  });

  it("EDT-13: Stale hash conflict leaves canonical Y.Text 100% unaltered", () => {
    const raw = `\\begin{tabular}{|c|}
  Unchanged \\\\
\\end{tabular}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const tableNode = docAst.nodes.find((n) => n.kind === "table") as TableNode;

    const res = applyTableCellPatch(yText, {
      fileId: "paper.tex",
      tableNode,
      rowIndex: 0,
      colIndex: 0,
      newContent: "Corrupted",
      expectedCellHash: "wrong_hash",
      baseDoc: yDoc,
    });

    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);
    expect(yText.toString()).toBe(raw);
  });
});
