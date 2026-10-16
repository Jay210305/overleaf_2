import React, { useState, useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { MathDisplayNode, FigureNode, TableNode, VisualBlockNode } from "@latex-collab/editor";

export function MathPreview({ formula, displayMode }: { formula: string; displayMode: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!element.current) return;
    try {
      katex.render(formula, element.current, { displayMode, throwOnError: true, trust: false });
    } catch {
      element.current.textContent = formula;
    }
  }, [formula, displayMode]);
  return <span ref={element}>{formula}</span>;
}

export interface VisualMathProps {
  node: MathDisplayNode;
  readOnly?: boolean;
  onFormulaChange?:
    ((nodeId: string, newFormula: string, expectedHash: string) => void) | undefined;
}

export const VisualMath: React.FC<VisualMathProps> = ({
  node,
  readOnly = false,
  onFormulaChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formula, setFormula] = useState(node.formula);
  const [base, setBase] = useState({ formula: node.formula, hash: node.hash });

  useEffect(() => {
    if (!isEditing) setFormula(node.formula);
  }, [node.formula, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    if (formula !== base.formula) {
      onFormulaChange?.(node.id, formula, base.hash);
    }
  };

  return (
    <div
      className="visual-math-container my-4 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 group relative"
      data-testid="visual-math"
      data-node-id={node.id}
      data-display-kind={node.displayKind}
    >
      <div className="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400 mb-2 font-mono">
        <span>Display Math ({node.displayKind})</span>
        <span
          className="text-[10px] text-gray-500 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded"
          title="LaTeX PDF compilation remains the final rendering authority"
        >
          PDF is authority
        </span>
      </div>

      {isEditing && !readOnly ? (
        <div className="space-y-2">
          <textarea
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleCommit();
              } else if (e.key === "Escape") {
                setFormula(node.formula);
                setIsEditing(false);
              }
            }}
            autoFocus
            rows={Math.max(2, formula.split("\n").length)}
            className="w-full px-3 py-2 border border-purple-500 rounded font-mono text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-label="Edit display formula"
            data-testid="math-textarea"
          />
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Press Ctrl+Enter or blur to apply</span>
            <span>Esc to cancel</span>
          </div>
        </div>
      ) : (
        <div
          className="cursor-pointer py-2 px-3 text-center font-mono text-base overflow-x-auto hover:bg-purple-100/50 dark:hover:bg-purple-900/30 rounded transition-colors"
          onClick={() => {
            if (!readOnly) {
              setBase({ formula: node.formula, hash: node.hash });
              setIsEditing(true);
            }
          }}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (!readOnly && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setBase({ formula: node.formula, hash: node.hash });
              setIsEditing(true);
            }
          }}
          data-testid="math-preview"
        >
          <MathPreview formula={node.formula} displayMode />
        </div>
      )}
    </div>
  );
};

export interface VisualFigureProps {
  node: FigureNode;
  authorizedImagePaths?: string[] | undefined;
  projectId?: string | undefined;
  fileId?: string | undefined;
  apiUrl?: string | undefined;
  readOnly?: boolean;
  onCaptionChange?:
    ((nodeId: string, newCaption: string, expectedHash: string) => void) | undefined;
  onLabelChange?: ((nodeId: string, newLabel: string, expectedHash: string) => void) | undefined;
}

export const VisualFigure: React.FC<VisualFigureProps> = ({
  node,
  authorizedImagePaths,
  projectId,
  fileId,
  apiUrl,
  readOnly = false,
  onCaptionChange,
  onLabelChange,
}) => {
  const [caption, setCaption] = useState(node.caption ?? "");
  const [label, setLabel] = useState(node.label ?? "");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [captionBase, setCaptionBase] = useState({ value: node.caption ?? "", hash: node.hash });
  const [labelBase, setLabelBase] = useState({ value: node.label ?? "", hash: node.hash });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingCaption) setCaption(node.caption ?? "");
    if (!isEditingLabel) setLabel(node.label ?? "");
  }, [node.caption, node.label, isEditingCaption, isEditingLabel]);

  useEffect(() => {
    if (!projectId || !fileId || !apiUrl) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setImageUrl(null);
    void (async () => {
      try {
        const response = await fetch(
          `${apiUrl}/projects/${projectId}/files/${fileId}/figure?path=${encodeURIComponent(node.imagePath)}`,
          { credentials: "include", signal: controller.signal },
        );
        if (
          !response.ok ||
          !["image/png", "image/jpeg", "image/webp"].includes(
            response.headers.get("content-type") ?? "",
          )
        )
          return;
        const blob = await response.blob();
        if (!blob.size || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } catch {
        // A missing, revoked or unavailable asset remains visibly unverified.
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiUrl, fileId, node.imagePath, projectId]);

  const isAuthorized =
    imageUrl !== null || (authorizedImagePaths?.includes(node.imagePath) ?? false);

  return (
    <figure
      className="visual-figure-container my-4 p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/30 dark:bg-blue-950/20"
      data-testid="visual-figure"
      data-node-id={node.id}
    >
      <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-2">
        <span className="font-semibold">Figure Environment</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
            isAuthorized
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          }`}
          data-testid="figure-asset-status"
        >
          {isAuthorized ? "Asset Authorized" : "Unverified Asset"}
        </span>
      </div>

      <div className="figure-preview-area p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-center text-sm font-mono text-gray-600 dark:text-gray-300">
        <div className="py-2">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={node.imagePath}
              className="mx-auto max-w-full max-h-72 object-contain"
            />
          ) : (
            <span>[Image: {node.imagePath}]</span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {/* Caption */}
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-xs text-gray-500 mr-2">Caption:</span>
          {isEditingCaption && !readOnly ? (
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => {
                setIsEditingCaption(false);
                if (caption !== captionBase.value) {
                  onCaptionChange?.(node.id, caption, captionBase.hash);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingCaption(false);
                  if (caption !== captionBase.value) {
                    onCaptionChange?.(node.id, caption, captionBase.hash);
                  }
                } else if (e.key === "Escape") {
                  setCaption(node.caption ?? "");
                  setIsEditingCaption(false);
                }
              }}
              autoFocus
              className="px-2 py-0.5 border border-blue-500 rounded text-sm w-3/4"
              data-testid="figure-caption-input"
            />
          ) : (
            <span
              className="cursor-pointer hover:underline"
              onClick={() => {
                if (!readOnly) {
                  setCaptionBase({ value: node.caption ?? "", hash: node.hash });
                  setIsEditingCaption(true);
                }
              }}
              data-testid="figure-caption"
            >
              {caption || <em className="text-gray-400">Add caption...</em>}
            </span>
          )}
        </div>

        {/* Label */}
        <div className="text-xs text-gray-500 flex items-center space-x-2">
          <span>Label:</span>
          {isEditingLabel && !readOnly ? (
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                setIsEditingLabel(false);
                if (label !== labelBase.value) {
                  onLabelChange?.(node.id, label, labelBase.hash);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingLabel(false);
                  if (label !== labelBase.value) {
                    onLabelChange?.(node.id, label, labelBase.hash);
                  }
                } else if (e.key === "Escape") {
                  setLabel(node.label ?? "");
                  setIsEditingLabel(false);
                }
              }}
              autoFocus
              className="px-1.5 py-0.5 border border-blue-500 rounded font-mono text-xs"
              data-testid="figure-label-input"
            />
          ) : (
            <span
              className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded cursor-pointer"
              onClick={() => {
                if (!readOnly) {
                  setLabelBase({ value: node.label ?? "", hash: node.hash });
                  setIsEditingLabel(true);
                }
              }}
              data-testid="figure-label"
            >
              {label || "none"}
            </span>
          )}
        </div>
      </div>
    </figure>
  );
};

export interface VisualTableProps {
  node: TableNode;
  readOnly?: boolean;
  onCellChange?:
    | ((
        nodeId: string,
        rowIndex: number,
        colIndex: number,
        newContent: string,
        expectedHash: string,
      ) => void)
    | undefined;
}

export const VisualTable: React.FC<VisualTableProps> = ({
  node,
  readOnly = false,
  onCellChange,
}) => {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number; hash: string } | null>(
    null,
  );
  const [cellValue, setCellValue] = useState("");

  const handleCommitCell = (row: number, col: number) => {
    setEditingCell(null);
    if (editingCell) onCellChange?.(node.id, row, col, cellValue, editingCell.hash);
  };

  return (
    <div
      className="visual-table-container my-4 p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50/50 dark:bg-gray-900/40 overflow-x-auto"
      data-testid="visual-table"
      data-node-id={node.id}
    >
      <div className="text-xs text-gray-500 mb-2 font-mono flex items-center justify-between">
        <span>
          Table ({node.environment}) — Alignment: {node.alignment}
        </span>
      </div>

      <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
        <tbody>
          {node.rows.map((row) => (
            <tr
              key={row.rowIndex}
              className="border-b border-gray-200 dark:border-gray-700"
              data-testid="table-row"
            >
              {row.cells.map((cell) => {
                const isEditing =
                  editingCell?.row === cell.rowIndex && editingCell?.col === cell.colIndex;

                return (
                  <td
                    key={cell.colIndex}
                    className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-center"
                    data-testid={`table-cell-${cell.rowIndex}-${cell.colIndex}`}
                  >
                    {isEditing && !readOnly ? (
                      <input
                        type="text"
                        value={cellValue}
                        onChange={(e) => setCellValue(e.target.value)}
                        onBlur={() => handleCommitCell(cell.rowIndex, cell.colIndex)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCommitCell(cell.rowIndex, cell.colIndex);
                          } else if (e.key === "Escape") {
                            setEditingCell(null);
                          }
                        }}
                        autoFocus
                        className="w-full px-1 py-0.5 border border-blue-500 rounded text-center text-sm"
                        data-testid="table-cell-input"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded block"
                        onClick={() => {
                          if (!readOnly) {
                            setEditingCell({
                              row: cell.rowIndex,
                              col: cell.colIndex,
                              hash: cell.hash,
                            });
                            setCellValue(cell.content);
                          }
                        }}
                      >
                        {cell.content || <span className="text-gray-300">∅</span>}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export interface AcademicVisualNodesViewProps {
  nodes: VisualBlockNode[];
  authorizedImagePaths?: string[];
  projectId?: string | undefined;
  fileId?: string | undefined;
  apiUrl?: string | undefined;
  readOnly?: boolean;
  onFormulaChange?: (nodeId: string, newFormula: string, expectedHash: string) => void;
  onCaptionChange?: (nodeId: string, newCaption: string, expectedHash: string) => void;
  onLabelChange?: (nodeId: string, newLabel: string, expectedHash: string) => void;
  onCellChange?: (
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    newContent: string,
    expectedHash: string,
  ) => void;
}

export const AcademicVisualNodesView: React.FC<AcademicVisualNodesViewProps> = ({
  nodes,
  authorizedImagePaths,
  projectId,
  fileId,
  apiUrl,
  readOnly = false,
  onFormulaChange,
  onCaptionChange,
  onLabelChange,
  onCellChange,
}) => {
  return (
    <div className="academic-visual-nodes-view space-y-4" data-testid="academic-visual-nodes-view">
      {nodes.map((node) => {
        switch (node.kind) {
          case "mathDisplay":
            return (
              <VisualMath
                key={node.id}
                node={node}
                readOnly={readOnly}
                onFormulaChange={onFormulaChange}
              />
            );
          case "figure":
            return (
              <VisualFigure
                key={node.id}
                node={node}
                authorizedImagePaths={authorizedImagePaths}
                projectId={projectId}
                fileId={fileId}
                apiUrl={apiUrl}
                readOnly={readOnly}
                onCaptionChange={onCaptionChange}
                onLabelChange={onLabelChange}
              />
            );
          case "table":
            return (
              <VisualTable
                key={node.id}
                node={node}
                readOnly={readOnly}
                onCellChange={onCellChange}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
