import * as Y from "yjs";

export type ResolvedCommentAnchor =
  | { detached: false; detachedReason: null; start: number; end: number }
  | { detached: true; detachedReason: "range_changed"; start: null; end: null };

export function resolveCommentAnchor(
  doc: Y.Doc,
  startJson: unknown,
  endJson: unknown,
  selectedText: string,
): ResolvedCommentAnchor {
  const detached = {
    detached: true,
    detachedReason: "range_changed",
    start: null,
    end: null,
  } as const;
  try {
    // Read the root text first: Yjs replaces the root wrapper on first typed
    // access after update-decoding, so positions resolved beforehand compare
    // against a stale wrapper and detach spuriously.
    const text = doc.getText("content");
    const start = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(startJson),
      doc,
    );
    const end = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(endJson),
      doc,
    );
    if (
      !start ||
      !end ||
      start.type !== text ||
      end.type !== text ||
      start.index >= end.index ||
      text.toString().slice(start.index, end.index) !== selectedText
    )
      return detached;
    return { detached: false, detachedReason: null, start: start.index, end: end.index };
  } catch {
    return detached;
  }
}
