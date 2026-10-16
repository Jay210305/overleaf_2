import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyVisualPatch, createVisualPatch } from "../../../packages/editor/src/visual-patch.js";

describe("S11-T04 Regression EDT-13: Minimal Source Patching Invariants", () => {
  const fileId = "00000000-0000-0000-0000-000000000001";

  it("EDT-13: Visual edits apply minimal localized splices and avoid whole-doc rewriting", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    const docText = "\\documentclass{article}\n\\begin{document}\n\\section{Old}\n\\end{document}";
    yText.insert(0, docText);

    const oldTitleOffset = docText.indexOf("Old");
    const patch = createVisualPatch(fileId, oldTitleOffset, oldTitleOffset + 3, "Old", "New", yDoc);

    const result = applyVisualPatch(yText, patch);
    expect(result.success).toBe(true);
    expect(yText.toString()).toBe(
      "\\documentclass{article}\n\\begin{document}\n\\section{New}\n\\end{document}",
    );
  });

  it("EDT-13: Concurrent changes trigger reparse or visible conflict, preserving source", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, "\\section{Original}");

    const patch = createVisualPatch(fileId, 9, 17, "Stale", "New", yDoc);
    const result = applyVisualPatch(yText, patch);

    expect(result.conflict).toBe(true);
    expect(yText.toString()).toBe("\\section{Original}");
  });
});
