import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseVisualAst, type TableNode, type MathDisplayNode, type FigureNode } from "@latex-collab/latex";
import {
  applyTableCellPatch,
  applyFormulaPatch,
  applyFigureCaptionPatch,
  applyFigureLabelPatch,
} from "../../packages/editor/src/visual-academic-patch.js";

describe("S11-T10 Integration: Simple Table and Formula Editing Slices", () => {
  it("modifies only target table cell and preserves surrounding delimiters and cells", () => {
    const raw = `\\begin{tabular}{|l|c|}
  Alpha & Beta \\\\
  Gamma & Delta \\\\
\\end{tabular}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const tableNode = docAst.nodes.find((n) => n.kind === "table") as TableNode;
    expect(tableNode).toBeDefined();

    // Edit cell [0, 1] ("Beta") -> "UpdatedBeta"
    const row0 = tableNode.rows[0];
    const cellBeta = row0?.cells[1];
    if (!cellBeta) throw new Error("cellBeta not found");
    const result = applyTableCellPatch(yText, {
      fileId: "test.tex",
      tableNode,
      rowIndex: 0,
      colIndex: 1,
      newContent: "UpdatedBeta",
      expectedCellHash: cellBeta.hash,
      baseDoc: yDoc,
    });

    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);

    const updatedText = yText.toString();
    expect(updatedText).toContain("UpdatedBeta");
    expect(updatedText).toContain("Alpha & UpdatedBeta \\\\");
    expect(updatedText).toContain("Gamma & Delta \\\\");
    expect(updatedText.startsWith("\\begin{tabular}{|l|c|}")).toBe(true);
    expect(updatedText.endsWith("\\end{tabular}")).toBe(true);
  });

  it("modifies only formula content and preserves delimiters without whole-document regeneration", () => {
    const raw = `Some introductory text before math.

\\[
  E = mc^2
\\]

Concluding remark.`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const mathNode = docAst.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    expect(mathNode).toBeDefined();

    const result = applyFormulaPatch(yText, {
      fileId: "test.tex",
      mathNode,
      newFormula: "E = \\sqrt{p^2 c^2 + m^2 c^4}",
      expectedFormulaHash: mathNode.hash, // formula hash check
      baseDoc: yDoc,
    });

    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);

    const updatedText = yText.toString();
    expect(updatedText).toContain("E = \\sqrt{p^2 c^2 + m^2 c^4}");
    expect(updatedText.startsWith("Some introductory text before math.")).toBe(true);
    expect(updatedText.endsWith("Concluding remark.")).toBe(true);
    expect(updatedText).toContain("\\[\n  E = \\sqrt{p^2 c^2 + m^2 c^4}\n\\]");
  });

  it("safely detects stale fragment hash and rejects concurrent modifications without corrupting source", () => {
    const raw = `\\begin{tabular}{|c|}
  OriginalData \\\\
\\end{tabular}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const tableNode = docAst.nodes.find((n) => n.kind === "table") as TableNode;

    // Simulate concurrent modification by passing an obsolete expectedCellHash
    const result = applyTableCellPatch(yText, {
      fileId: "test.tex",
      tableNode,
      rowIndex: 0,
      colIndex: 0,
      newContent: "HackedData",
      expectedCellHash: "stale_hash_from_earlier_state",
      baseDoc: yDoc,
    });

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe("STALE_FRAGMENT_HASH");

    // Verify source is 100% untouched
    expect(yText.toString()).toBe(raw);
  });

  it("handles figure caption and label patches with exact range isolation", () => {
    const raw = `\\begin{figure}
  \\includegraphics{figures/flow.png}
  \\caption{Initial workflow caption}
  \\label{fig:initial}
\\end{figure}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const figureNode = docAst.nodes.find((n) => n.kind === "figure") as FigureNode;
    expect(figureNode).toBeDefined();

    // Patch caption using figureNode.hash (as emitted by VisualFigure React component)
    const captionRes = applyFigureCaptionPatch(yText, {
      fileId: "test.tex",
      figureNode,
      newCaption: "Revised workflow architecture",
      expectedCaptionHash: figureNode.hash,
      baseDoc: yDoc,
    });
    expect(captionRes.success).toBe(true);
    expect(yText.toString()).toContain("\\caption{Revised workflow architecture}");

    // Refresh AST for label range
    const updatedAst = parseVisualAst(yText.toString());
    const updatedFig = updatedAst.nodes.find((n) => n.kind === "figure") as FigureNode;

    // Patch label using node hash
    const labelRes = applyFigureLabelPatch(yText, {
      fileId: "test.tex",
      figureNode: updatedFig,
      newLabel: "fig:workflow-revised",
      expectedLabelHash: updatedFig.hash,
      baseDoc: yDoc,
    });
    expect(labelRes.success).toBe(true);
    expect(yText.toString()).toContain("\\label{fig:workflow-revised}");

    // Verify rejection on stale caption hash
    const staleCaptionRes = applyFigureCaptionPatch(yText, {
      fileId: "test.tex",
      figureNode,
      newCaption: "Should fail",
      expectedCaptionHash: "stale_caption_hash",
      baseDoc: yDoc,
    });
    expect(staleCaptionRes.conflict).toBe(true);
    expect(staleCaptionRes.reason).toBe("STALE_FRAGMENT_HASH");
  });

  it("returns CELL_NOT_FOUND when targeting out of range row or column", () => {
    const raw = `\\begin{tabular}{|c|}
  SoloCell \\\\
\\end{tabular}`;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const docAst = parseVisualAst(raw);
    const tableNode = docAst.nodes.find((n) => n.kind === "table") as TableNode;

    const result = applyTableCellPatch(yText, {
      fileId: "test.tex",
      tableNode,
      rowIndex: 5,
      colIndex: 5,
      newContent: "Ghost",
      expectedCellHash: "any",
    });

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe("CELL_NOT_FOUND");
    expect(yText.toString()).toBe(raw);
  });
});
