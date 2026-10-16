import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { resolveCommentAnchor } from "../../../apps/api/src/modules/comments/anchors.js";

describe("S08-T04 relative comment anchors", () => {
  it("follows insertions before a range and detaches when the selected text disappears", () => {
    const doc = new Y.Doc();
    const text = doc.getText("content");
    text.insert(0, "A target Z");
    const start = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 2));
    const end = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 8));
    expect(resolveCommentAnchor(doc, start, end, "target")).toMatchObject({
      detached: false,
      start: 2,
      end: 8,
    });
    text.insert(0, "new ");
    expect(resolveCommentAnchor(doc, start, end, "target")).toMatchObject({
      detached: false,
      start: 6,
      end: 12,
    });
    text.delete(6, 6);
    expect(resolveCommentAnchor(doc, start, end, "target")).toEqual({
      detached: true,
      detachedReason: "range_changed",
      start: null,
      end: null,
    });
    doc.destroy();
  });
});
