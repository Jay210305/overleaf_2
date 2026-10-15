import * as Y from "yjs";
import {
  computeTextHash,
  type HeadingNode,
  type ParagraphNode,
  type ListNode,
} from "@latex-collab/latex";
import type { VisualPatch, VisualPatchResult } from "@latex-collab/contracts";

export interface ReanchorDelta {
  index: number;
  deleteLength: number;
  insertLength: number;
}

/**
 * Creates a validated VisualPatch from target ranges and text content.
 */
export function createVisualPatch(
  fileId: string,
  start: number,
  end: number,
  expectedText: string,
  replacement: string,
  baseDoc?: Y.Doc
): VisualPatch {
  let baseStateVectorBase64 = "";
  if (baseDoc) {
    const sv = Y.encodeStateVector(baseDoc);
    baseStateVectorBase64 = Buffer.from(sv).toString("base64");
  }

  return {
    fileId,
    start,
    end,
    expectedTextHash: computeTextHash(expectedText),
    replacement,
    baseStateVectorBase64,
  };
}

/**
 * Applies a minimal version-checked source patch directly to a canonical Y.Text.
 *
 * Invariants:
 * 1. Checks that the range [patch.start, patch.end] contains text matching patch.expectedTextHash.
 * 2. If the hash does not match (due to concurrent modifications), aborts and returns conflict: true.
 * 3. Never regenerates the whole document; applies a minimal splice to only the target region.
 * 4. Preserves all surrounding code, whitespace, comments, and structure.
 */
export function applyVisualPatch(yText: Y.Text, patch: VisualPatch): VisualPatchResult {
  const currentLength = yText.length;

  if (patch.start < 0 || patch.end < patch.start || patch.end > currentLength) {
    return {
      success: false,
      conflict: true,
      reason: "RANGE_OUT_OF_BOUNDS",
    };
  }

  const currentFullText = yText.toString();
  const actualSlice = currentFullText.slice(patch.start, patch.end);
  const actualHash = computeTextHash(actualSlice);

  if (actualHash !== patch.expectedTextHash) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  const deleteCount = patch.end - patch.start;

  if (yText.doc) {
    yText.doc.transact(() => {
      if (deleteCount > 0) {
        yText.delete(patch.start, deleteCount);
      }
      if (patch.replacement.length > 0) {
        yText.insert(patch.start, patch.replacement);
      }
    });
  } else {
    if (deleteCount > 0) {
      yText.delete(patch.start, deleteCount);
    }
    if (patch.replacement.length > 0) {
      yText.insert(patch.start, patch.replacement);
    }
  }

  const updatedFullText = yText.toString();
  const newSlice = updatedFullText.slice(patch.start, patch.start + patch.replacement.length);
  const newTextHash = computeTextHash(newSlice);

  return {
    success: true,
    conflict: false,
    newTextHash,
  };
}

/**
 * Re-anchors a source range when non-conflicting concurrent edits have occurred outside the region.
 */
export function reanchorRange(
  initialStart: number,
  initialEnd: number,
  deltas: ReanchorDelta[]
): { start: number; end: number; shifted: boolean } {
  let start = initialStart;
  let end = initialEnd;
  let shifted = false;

  for (const delta of deltas) {
    const change = delta.insertLength - delta.deleteLength;
    if (delta.index + delta.deleteLength <= start) {
      start += change;
      end += change;
      shifted = true;
    } else if (delta.index < end) {
      // Delta overlaps with the target region
      return { start: initialStart, end: initialEnd, shifted: false };
    }
  }

  return { start, end, shifted };
}

export interface HeadingPatchOptions {
  fileId: string;
  headingNode: HeadingNode;
  newTitle: string;
  expectedTitleHash?: string | undefined;
  baseDoc?: Y.Doc | undefined;
}

/**
 * Applies a minimal version-checked patch to a heading title.
 * Mutates only the title text, preserving the command and surrounding braces/whitespace.
 */
export function applyHeadingPatch(
  yText: Y.Text,
  options: HeadingPatchOptions
): VisualPatchResult {
  const patch = createVisualPatch(
    options.fileId,
    options.headingNode.titleRange.start,
    options.headingNode.titleRange.end,
    options.headingNode.title,
    options.newTitle,
    options.baseDoc
  );

  if (
    options.expectedTitleHash &&
    options.expectedTitleHash !== options.headingNode.hash &&
    options.expectedTitleHash !== computeTextHash(options.headingNode.title)
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

export interface ParagraphPatchOptions {
  fileId: string;
  paragraphNode: ParagraphNode;
  newText: string;
  expectedParagraphHash?: string | undefined;
  baseDoc?: Y.Doc | undefined;
}

/**
 * Applies a minimal version-checked patch to a paragraph.
 * Mutates only the paragraph range, preserving surrounding blocks.
 */
export function applyParagraphPatch(
  yText: Y.Text,
  options: ParagraphPatchOptions
): VisualPatchResult {
  const patch = createVisualPatch(
    options.fileId,
    options.paragraphNode.range.start,
    options.paragraphNode.range.end,
    options.paragraphNode.raw,
    options.newText,
    options.baseDoc
  );

  if (
    options.expectedParagraphHash &&
    options.expectedParagraphHash !== options.paragraphNode.hash &&
    options.expectedParagraphHash !== computeTextHash(options.paragraphNode.text)
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

export interface ListItemPatchOptions {
  fileId: string;
  listNode: ListNode;
  itemIndex: number;
  newContent: string;
  expectedItemHash?: string | undefined;
  baseDoc?: Y.Doc | undefined;
}

/**
 * Applies a minimal version-checked patch to a list item's content.
 * Mutates only the item content, preserving \item marker and other items.
 */
export function applyListItemPatch(
  yText: Y.Text,
  options: ListItemPatchOptions
): VisualPatchResult {
  const item = options.listNode.items[options.itemIndex];
  if (!item) {
    return {
      success: false,
      conflict: true,
      reason: "ITEM_NOT_FOUND",
    };
  }

  const patch = createVisualPatch(
    options.fileId,
    item.contentRange.start,
    item.contentRange.end,
    item.content,
    options.newContent,
    options.baseDoc
  );

  if (
    options.expectedItemHash &&
    options.expectedItemHash !== item.hash &&
    options.expectedItemHash !== computeTextHash(item.content) &&
    options.expectedItemHash !== options.listNode.hash
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

