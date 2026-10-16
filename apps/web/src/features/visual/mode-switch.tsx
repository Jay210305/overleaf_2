import React, { useState, useCallback, useEffect } from "react";
import * as Y from "yjs";
import { computeTextHash, parseVisualAst, type VisualAstDocument } from "@latex-collab/editor";
import { textStateSchema } from "@latex-collab/contracts";
import { AcademicVisualNodesView } from "./academic-nodes.js";
import { BasicVisualNodesView } from "./basic-nodes.js";
import { VisualLiteralFallback } from "./fallback-node.js";

export type EditorMode = "code" | "visual";

export interface ModeSwitchState {
  mode: EditorMode;
  initialSourceHash: string | null;
  hasUncommittedEdits: boolean;
  activeOffset: number;
  ast: VisualAstDocument | null;
}

export interface UseEditorModeSwitchOptions {
  yText: Y.Text;
  initialMode?: EditorMode;
  onModeChange?: (mode: EditorMode, targetOffset: number) => void;
}

export interface UseEditorModeSwitchResult {
  mode: EditorMode;
  ast: VisualAstDocument | null;
  activeOffset: number;
  hasUncommittedEdits: boolean;
  initialSourceHash: string | null;
  setMode: (mode: EditorMode, targetOffset?: number) => boolean;
  toggleMode: (targetOffset?: number) => boolean;
  recordVisualEdit: () => void;
  syncCursorOffset: (offset: number) => void;
  verifySourceByteFidelity: () => boolean;
}

/**
 * Hook managing zero-mutation Code <-> Visual mode switching.
 * Guarantees that opening visual mode and returning to code without edits leaves
 * 100% of bytes and SHA-256 hash identical.
 */
export function useEditorModeSwitch({
  yText,
  initialMode = "code",
  onModeChange,
}: UseEditorModeSwitchOptions): UseEditorModeSwitchResult {
  const [mode, setModeState] = useState<EditorMode>(initialMode);
  const [activeOffset, setActiveOffset] = useState<number>(0);
  const [initialSourceHash, setInitialSourceHash] = useState<string | null>(null);
  const [hasUncommittedEdits, setHasUncommittedEdits] = useState<boolean>(false);
  const [ast, setAst] = useState<VisualAstDocument | null>(() => {
    return initialMode === "visual" ? parseVisualAst(yText.toString()) : null;
  });

  const recordVisualEdit = useCallback(() => {
    setHasUncommittedEdits(true);
  }, []);

  const syncCursorOffset = useCallback((offset: number) => {
    setActiveOffset(Math.max(0, offset));
  }, []);

  const verifySourceByteFidelity = useCallback((): boolean => {
    if (!initialSourceHash) return true;
    const currentHash = computeTextHash(yText.toString());
    return currentHash === initialSourceHash;
  }, [yText, initialSourceHash]);

  const setMode = useCallback(
    (newMode: EditorMode, targetOffset?: number): boolean => {
      const offset = targetOffset !== undefined ? targetOffset : activeOffset;
      const currentRaw = yText.toString();
      const currentHash = computeTextHash(currentRaw);

      if (newMode === mode) {
        if (targetOffset !== undefined) setActiveOffset(targetOffset);
        return true;
      }

      if (newMode === "visual") {
        // Entering visual mode: snapshot source hash and parse conservative AST
        const parsedAst = parseVisualAst(currentRaw);
        setInitialSourceHash(currentHash);
        setHasUncommittedEdits(false);
        setAst(parsedAst);
        setModeState("visual");
        setActiveOffset(offset);
        onModeChange?.("visual", offset);
        return true;
      } else {
        // Exiting visual mode back to code mode
        if (!hasUncommittedEdits && initialSourceHash) {
          // Zero-mutation invariant check
          if (currentHash !== initialSourceHash) {
            console.error(
              "Invariant violation: Source hash mutated during unedited visual session!",
            );
          }
        }
        setModeState("code");
        setActiveOffset(offset);
        onModeChange?.("code", offset);
        return true;
      }
    },
    [mode, activeOffset, yText, initialSourceHash, hasUncommittedEdits, onModeChange],
  );

  const toggleMode = useCallback(
    (targetOffset?: number): boolean => {
      const nextMode: EditorMode = mode === "code" ? "visual" : "code";
      return setMode(nextMode, targetOffset);
    },
    [mode, setMode],
  );

  return {
    mode,
    ast,
    activeOffset,
    hasUncommittedEdits,
    initialSourceHash,
    setMode,
    toggleMode,
    recordVisualEdit,
    syncCursorOffset,
    verifySourceByteFidelity,
  };
}

export interface EditorModeSwitchProps {
  mode: EditorMode;
  onSelectMode: (mode: EditorMode) => void;
  hasErrors?: boolean;
  disabled?: boolean;
}

export const EditorModeSwitch: React.FC<EditorModeSwitchProps> = ({
  mode,
  onSelectMode,
  hasErrors = false,
  disabled = false,
}) => {
  return (
    <div
      className="inline-flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium"
      data-testid="editor-mode-switch"
      role="radiogroup"
      aria-label="Editor display mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "code"}
        disabled={disabled}
        onClick={() => onSelectMode("code")}
        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
          mode === "code"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-semibold"
            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        data-testid="mode-code-btn"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        <span>Code</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={mode === "visual"}
        disabled={disabled}
        onClick={() => onSelectMode("visual")}
        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
          mode === "visual"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-semibold"
            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        data-testid="mode-visual-btn"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
        <span>Visual</span>
        {hasErrors && (
          <span
            className="w-2 h-2 rounded-full bg-amber-500"
            title="Document contains syntax fallbacks or errors"
            data-testid="mode-error-dot"
          />
        )}
      </button>
    </div>
  );
};

export interface ReadOnlyTextDocumentProps {
  projectId: string;
  fileId: string;
  apiUrl: string;
}

/** Authorized canonical source projection. No local edit is presented as saved. */
export function ReadOnlyTextDocument({ projectId, fileId, apiUrl }: ReadOnlyTextDocumentProps) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDoc(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/projects/${projectId}/files/${fileId}/text`, {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401 || response.status === 403 || response.status === 404
              ? "Text unavailable or access denied."
              : "Could not load document text.",
          );
        }
        const state = textStateSchema.parse(await response.json());
        if (state.fileId !== fileId)
          throw new Error("Text response did not match the selected file.");
        const loaded = new Y.Doc();
        Y.applyUpdate(
          loaded,
          Uint8Array.from(atob(state.updateBase64), (char) => char.charCodeAt(0)),
        );
        if (!controller.signal.aborted) setDoc(loaded);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error && cause.message.startsWith("Text unavailable")
              ? cause.message
              : "Could not load document text.",
          );
        }
      }
    })();
    return () => controller.abort();
  }, [apiUrl, fileId, projectId]);

  if (error) return <p role="alert">{error}</p>;
  if (!doc) return <p role="status">Loading document text…</p>;
  return (
    <ReadOnlyLoadedDocument
      yText={doc.getText("content")}
      projectId={projectId}
      fileId={fileId}
      apiUrl={apiUrl}
    />
  );
}

function ReadOnlyLoadedDocument({
  yText,
  projectId,
  fileId,
  apiUrl,
}: {
  yText: Y.Text;
  projectId: string;
  fileId: string;
  apiUrl: string;
}) {
  const { mode, ast, setMode } = useEditorModeSwitch({ yText });

  return (
    <div role="region" aria-label="Read-only document">
      <p role="status">Read-only preview. Editing is unavailable here.</p>
      <EditorModeSwitch mode={mode} onSelectMode={setMode} hasErrors={ast?.hasErrors ?? false} />
      {mode === "code" ? (
        <pre data-testid="source-code" style={{ whiteSpace: "pre-wrap" }}>
          {yText.toString()}
        </pre>
      ) : (
        <div data-testid="visual-document">
          {ast?.nodes.map((node) => {
            if (node.kind === "paragraph") {
              if (node.spans.some((span) => span.kind === "text" && span.text.includes("\\"))) {
                return (
                  <VisualLiteralFallback
                    key={node.id}
                    node={{
                      id: node.id,
                      kind: "literalFallback",
                      reason: "unknownMacro",
                      description:
                        "Source shown literally because this paragraph contains unsupported TeX.",
                      range: node.range,
                      raw: node.raw,
                      hash: node.hash,
                    }}
                    readOnly
                  />
                );
              }
            }
            if (node.kind === "literalFallback") {
              return <VisualLiteralFallback key={node.id} node={node} readOnly />;
            }
            if (node.kind === "heading" || node.kind === "paragraph" || node.kind === "list") {
              return <BasicVisualNodesView key={node.id} nodes={[node]} readOnly />;
            }
            if (node.kind === "mathDisplay" || node.kind === "figure" || node.kind === "table") {
              return (
                <AcademicVisualNodesView
                  key={node.id}
                  nodes={[node]}
                  readOnly
                  projectId={projectId}
                  fileId={fileId}
                  apiUrl={apiUrl}
                />
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
