import * as Y from "yjs";
import {
  computeTextHash,
  type TableNode,
  type MathDisplayNode,
  type FigureNode,
} from "@latex-collab/latex";
import type { VisualPatchResult } from "@latex-collab/contracts";
import { applyVisualPatch, createVisualPatch } from "./visual-patch.js";

export interface TableCellPatchOptions {
  fileId: string;
  tableNode: TableNode;
  rowIndex: number;
  colIndex: number;
  newContent: string;
  expectedCellHash: string;
  baseDoc?: Y.Doc | undefined;
}

export interface FormulaPatchOptions {
  fileId: string;
  mathNode: MathDisplayNode;
  newFormula: string;
  expectedFormulaHash: string;
  baseDoc?: Y.Doc | undefined;
}

export interface FigureCaptionPatchOptions {
  fileId: string;
  figureNode: FigureNode;
  newCaption: string;
  expectedCaptionHash: string;
  baseDoc?: Y.Doc | undefined;
}

export interface FigureLabelPatchOptions {
  fileId: string;
  figureNode: FigureNode;
  newLabel: string;
  expectedLabelHash: string;
  baseDoc?: Y.Doc | undefined;
}

/**
 * Applies a minimal version-checked patch to a specific cell in a tabular environment.
 * Mutates only the cell text, preserving row/column delimiters and all other cells.
 */
export function applyTableCellPatch(
  yText: Y.Text,
  options: TableCellPatchOptions
): VisualPatchResult {
  const row = options.tableNode.rows[options.rowIndex];
  if (!row) {
    return {
      success: false,
      conflict: true,
      reason: "CELL_NOT_FOUND",
    };
  }

  const cell = row.cells[options.colIndex];
  if (!cell) {
    return {
      success: false,
      conflict: true,
      reason: "CELL_NOT_FOUND",
    };
  }

  const patch = createVisualPatch(
    options.fileId,
    cell.range.start,
    cell.range.end,
    cell.content,
    options.newContent,
    options.baseDoc
  );

  // If caller provided a specific expectedCellHash, enforce it
  if (options.expectedCellHash && options.expectedCellHash !== cell.hash) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

/**
 * Applies a minimal version-checked patch to a math display formula.
 * Mutates only the formula body, preserving the outer formula delimiters.
 */
export function applyFormulaPatch(
  yText: Y.Text,
  options: FormulaPatchOptions
): VisualPatchResult {
  const range = options.mathNode.formulaRange;

  const patch = createVisualPatch(
    options.fileId,
    range.start,
    range.end,
    options.mathNode.formula,
    options.newFormula,
    options.baseDoc
  );

  if (
    options.expectedFormulaHash &&
    options.expectedFormulaHash !== options.mathNode.hash &&
    options.expectedFormulaHash !== computeTextHash(options.mathNode.formula)
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

/**
 * Applies a minimal version-checked patch to a figure caption.
 */
export function applyFigureCaptionPatch(
  yText: Y.Text,
  options: FigureCaptionPatchOptions
): VisualPatchResult {
  const range = options.figureNode.captionRange;
  if (!range || options.figureNode.caption === null) {
    return {
      success: false,
      conflict: true,
      reason: "CAPTION_NOT_FOUND",
    };
  }

  const patch = createVisualPatch(
    options.fileId,
    range.start,
    range.end,
    options.figureNode.caption,
    options.newCaption,
    options.baseDoc
  );

  if (
    options.expectedCaptionHash &&
    options.expectedCaptionHash !== options.figureNode.hash &&
    options.expectedCaptionHash !== computeTextHash(options.figureNode.caption)
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}

/**
 * Applies a minimal version-checked patch to a figure label.
 */
export function applyFigureLabelPatch(
  yText: Y.Text,
  options: FigureLabelPatchOptions
): VisualPatchResult {
  const range = options.figureNode.labelRange;
  if (!range || options.figureNode.label === null) {
    return {
      success: false,
      conflict: true,
      reason: "LABEL_NOT_FOUND",
    };
  }

  const patch = createVisualPatch(
    options.fileId,
    range.start,
    range.end,
    options.figureNode.label,
    options.newLabel,
    options.baseDoc
  );

  if (
    options.expectedLabelHash &&
    options.expectedLabelHash !== options.figureNode.hash &&
    options.expectedLabelHash !== computeTextHash(options.figureNode.label)
  ) {
    return {
      success: false,
      conflict: true,
      reason: "STALE_FRAGMENT_HASH",
    };
  }

  return applyVisualPatch(yText, patch);
}
