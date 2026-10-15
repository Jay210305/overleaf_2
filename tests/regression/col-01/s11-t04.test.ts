import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyVisualPatch, createVisualPatch } from "../../../packages/editor/src/visual-patch.js";

describe("S11-T04 Regression COL-01: Yjs Concurrency and Minimal Patch Convergence", () => {
  const fileId = "00000000-0000-0000-0000-000000000002";

  it("COL-01: Independent visual patch on client A converges with code edit on client B", () => {
    // Client A (Visual Editor)
    const docA = new Y.Doc();
    const textA = docA.getText("content");
    const initialText = "\\section{Alpha}\n\nBeta paragraph.";
    textA.insert(0, initialText);

    // Client B (Code Editor)
    const docB = new Y.Doc();
    const textB = docB.getText("content");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Client A applies visual patch to "Alpha" -> "Alpha Prime"
    const patch = createVisualPatch(fileId, 9, 14, "Alpha", "Alpha Prime", docA);
    const result = applyVisualPatch(textA, patch);
    expect(result.success).toBe(true);

    // Client B concurrently edits paragraph: "Beta paragraph." -> "Beta paragraph with additions."
    const paraOffset = textB.toString().indexOf("Beta paragraph.");
    textB.insert(paraOffset + "Beta paragraph".length, " with additions");

    // Sync updates bidirectionally
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);

    // Both documents must converge exactly
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toBe("\\section{Alpha Prime}\n\nBeta paragraph with additions.");
  });
});
