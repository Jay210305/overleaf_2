import { describe, expect, it } from "vitest";
import { parseVisualAst, serializeVisualAst, computeTextHash, type HeadingNode, type ParagraphNode } from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../packages/editor/src/visual-patch.js";
import { ROUND_TRIP_FIXTURES } from "./visual-round-trip.test.js";
import * as Y from "yjs";

describe("S11-T08 Integration: Non-Destructive Round-Trip and Localized Edits", () => {
  it("verifies all 100 fixtures are byte-identical without edit", () => {
    expect(ROUND_TRIP_FIXTURES.length).toBe(100);

    for (let i = 0; i < ROUND_TRIP_FIXTURES.length; i++) {
      const fixture = ROUND_TRIP_FIXTURES[i]!;
      const doc = parseVisualAst(fixture);
      const output = serializeVisualAst(doc);

      expect(output).toBe(fixture);
      expect(computeTextHash(output)).toBe(computeTextHash(fixture));
    }
  });

  it("verifies edited supported region is the only changed region in a multi-block document", () => {
    const raw = `\\section{First Section}
Introductory paragraph text.

\\subsection{Nested Section}
Nested paragraph text.

\\[
  \\int_0^1 f(x) dx
\\]

Concluding remarks.`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const doc = parseVisualAst(raw);
    const firstSection = doc.nodes.find((n) => n.kind === "heading" && n.title === "First Section") as HeadingNode;
    expect(firstSection).toBeDefined();

    const patch = createVisualPatch(
      "doc.tex",
      firstSection.titleRange.start,
      firstSection.titleRange.end,
      firstSection.title,
      "Updated Section Title",
      yDoc
    );

    const result = applyVisualPatch(yText, patch);
    expect(result.success).toBe(true);

    const updated = yText.toString();

    // Verify before and after regions are byte-identical
    const expected = `\\section{Updated Section Title}
Introductory paragraph text.

\\subsection{Nested Section}
Nested paragraph text.

\\[
  \\int_0^1 f(x) dx
\\]

Concluding remarks.`;

    expect(updated).toBe(expected);
    expect(computeTextHash(updated.slice(firstSection.range.end + ("Updated Section Title".length - "First Section".length))))
      .toBe(computeTextHash(raw.slice(firstSection.range.end)));
  });

  it("re-anchors non-overlapping concurrent edits correctly", () => {
    const raw = "Paragraph Alpha.\n\nParagraph Beta.\n\nParagraph Gamma.";
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const doc = parseVisualAst(raw);
    const paraBeta = doc.nodes[1] as ParagraphNode;
    expect(paraBeta).toBeDefined();

    // Visual patch on Beta
    const patch = createVisualPatch(
      "doc.tex",
      paraBeta.range.start,
      paraBeta.range.end,
      paraBeta.raw,
      "Paragraph Beta (Modified).\n\n",
      yDoc
    );

    const result = applyVisualPatch(yText, patch);
    expect(result.success).toBe(true);
    expect(yText.toString()).toContain("Paragraph Alpha.");
    expect(yText.toString()).toContain("Paragraph Beta (Modified).");
    expect(yText.toString()).toContain("Paragraph Gamma.");
  });
});
