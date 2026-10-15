import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  applyVisualPatch,
  createVisualPatch,
  reanchorRange,
  applyHeadingPatch,
  applyParagraphPatch,
  applyListItemPatch,
} from "../../packages/editor/src/visual-patch.js";
import {
  computeTextHash,
  parseVisualAst,
  type HeadingNode,
  type ParagraphNode,
  type ListNode,
} from "../../packages/latex/src/visual-ast.js";
import { visualPatchSchema } from "@latex-collab/contracts";

describe("S11-T04 Integration: Apply Minimal Version-Checked Source Patches", () => {
  const fileId = "11111111-2222-3333-4444-555555555555";

  it("applies a localized patch to Y.Text without modifying surrounding content", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    const initialText = "\\section{Original Title}\n\nHere is a paragraph of text.";
    yText.insert(0, initialText);

    // Patch specifically the heading title "Original Title"
    const start = "\\section{".length;
    const end = start + "Original Title".length;
    const patch = createVisualPatch(fileId, start, end, "Original Title", "Brand New Title", yDoc);

    const result = applyVisualPatch(yText, patch);
    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);

    const updatedText = yText.toString();
    expect(updatedText).toBe("\\section{Brand New Title}\n\nHere is a paragraph of text.");

    // Verify surrounding text before start is untouched
    expect(updatedText.slice(0, start)).toBe("\\section{");
    // Verify surrounding text after replacement is untouched
    expect(updatedText.slice(start + "Brand New Title".length)).toBe("}\n\nHere is a paragraph of text.");
  });

  it("detects stale fragment hash and returns conflict without mutating document", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, "\\section{Current Title}\nSome text.");

    // Create patch with stale expected hash
    const patch = {
      fileId,
      start: 9,
      end: 22,
      expectedTextHash: computeTextHash("Stale Old Title"),
      replacement: "Conflicting Title",
      baseStateVectorBase64: "",
    };

    const initialContent = yText.toString();
    const result = applyVisualPatch(yText, patch);

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe("STALE_FRAGMENT_HASH");

    // Invariant: Source is NOT corrupted or modified on conflict
    expect(yText.toString()).toBe(initialContent);
  });

  it("handles range out of bounds gracefully without throwing", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, "Short text.");

    const patch = {
      fileId,
      start: 50,
      end: 100,
      expectedTextHash: "dummy",
      replacement: "Overflow",
      baseStateVectorBase64: "",
    };

    const result = applyVisualPatch(yText, patch);
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.reason).toBe("RANGE_OUT_OF_BOUNDS");
  });

  it("re-anchors ranges correctly when preceding edits shift offsets", () => {
    // Initial range [20, 30]
    // A preceding edit at offset 0 inserted 5 characters and deleted 2 (net +3)
    const deltas = [{ index: 0, deleteLength: 2, insertLength: 5 }];
    const reanchored = reanchorRange(20, 30, deltas);

    expect(reanchored.shifted).toBe(true);
    expect(reanchored.start).toBe(23);
    expect(reanchored.end).toBe(33);

    // Overlapping delta should not shift
    const overlapping = [{ index: 25, deleteLength: 2, insertLength: 2 }];
    const failedReanchor = reanchorRange(20, 30, overlapping);
    expect(failedReanchor.shifted).toBe(false);
  });

  it("validates visualPatchSchema with both UUID and string fileId identifiers", () => {
    const uuidPatch = createVisualPatch(
      "123e4567-e89b-12d3-a456-426614174000",
      0,
      10,
      "Old Title",
      "New Title"
    );
    expect(visualPatchSchema.safeParse(uuidPatch).success).toBe(true);

    const docPatch = createVisualPatch("main.tex", 5, 15, "Original", "Updated");
    expect(visualPatchSchema.safeParse(docPatch).success).toBe(true);
  });

  it("patches heading title cleanly and rejects stale hash", () => {
    const raw = "\\section{Original Section Title}\nParagraph text.";
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const doc = parseVisualAst(raw);
    const heading = doc.nodes[0] as HeadingNode;

    // Successful heading patch
    const res = applyHeadingPatch(yText, {
      fileId: "doc.tex",
      headingNode: heading,
      newTitle: "Updated Section Title",
      expectedTitleHash: heading.hash,
      baseDoc: yDoc,
    });
    expect(res.success).toBe(true);
    expect(yText.toString()).toBe("\\section{Updated Section Title}\nParagraph text.");

    // Conflict on stale hash
    const staleRes = applyHeadingPatch(yText, {
      fileId: "doc.tex",
      headingNode: heading,
      newTitle: "Failed Title",
      expectedTitleHash: "stale_hash_value",
      baseDoc: yDoc,
    });
    expect(staleRes.conflict).toBe(true);
  });

  it("patches paragraph content and list item content cleanly", () => {
    const raw = `\\begin{itemize}
  \\item First bullet item
  \\item Second bullet item
\\end{itemize}

A standalone paragraph for testing.`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);

    const doc = parseVisualAst(raw);
    const list = doc.nodes.find((n) => n.kind === "list") as ListNode;

    // Patch list item 1
    const listRes = applyListItemPatch(yText, {
      fileId: "doc.tex",
      listNode: list,
      itemIndex: 1,
      newContent: "Modified second bullet item",
      expectedItemHash: list.items[1]?.hash,
      baseDoc: yDoc,
    });
    expect(listRes.success).toBe(true);
    expect(yText.toString()).toContain("\\item Modified second bullet item");

    // Patch paragraph
    const updatedDoc = parseVisualAst(yText.toString());
    const updatedPara = updatedDoc.nodes.find((n) => n.kind === "paragraph") as ParagraphNode;

    const paraRes = applyParagraphPatch(yText, {
      fileId: "doc.tex",
      paragraphNode: updatedPara,
      newText: "A revised paragraph for testing.",
      expectedParagraphHash: updatedPara.hash,
      baseDoc: yDoc,
    });
    expect(paraRes.success).toBe(true);
    expect(yText.toString()).toContain("A revised paragraph for testing.");
  });
});
