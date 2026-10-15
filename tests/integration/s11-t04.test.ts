import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  applyVisualPatch,
  createVisualPatch,
  reanchorRange,
} from "../../packages/editor/src/visual-patch.js";
import { computeTextHash } from "../../packages/latex/src/visual-ast.js";

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
});
