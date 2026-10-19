import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  createLatexEditorExtensions,
  getModeForFilename,
  type EditorTheme,
  createEditorKeymap,
  EditorView,
  EditorState,
} from "@latex-collab/editor";
import type { Role } from "@latex-collab/contracts";
import type * as Y from "yjs";
import { createCollabBinding } from "../collab/binding.js";

export interface LatexCodeEditorProps {
  projectId: string;
  fileId: string;
  fileName?: string;
  initialContent?: string;
  yText?: Y.Text;
  readOnly?: boolean;
  theme?: EditorTheme;
  userRole?: Role;
  onChange?: (content: string) => void;
  onSave?: () => void;
  onCompile?: () => void;
  saveStatus?: "saved" | "saving" | "offline" | "error";
  errorMessage?: string | null;
  errorCode?: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SERVICE_UNAVAILABLE" | null;
}

export const LatexCodeEditor: React.FC<LatexCodeEditorProps> = ({
  projectId,
  fileId,
  fileName = "main.tex",
  initialContent = "",
  yText,
  readOnly = false,
  theme = "light",
  userRole,
  onChange,
  onSave,
  onCompile,
  saveStatus = "saved",
  errorMessage,
  errorCode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [currentLine, setCurrentLine] = useState<number>(1);
  const [currentCol, setCurrentCol] = useState<number>(1);

  const isViewerOrReadOnly = readOnly || userRole === "VIEWER" || userRole === "REVIEWER";
  const mode = useMemo(() => getModeForFilename(fileName), [fileName]);

  useEffect(() => {
    if (!containerRef.current) return;

    const binding = yText?.doc ? createCollabBinding({ doc: yText.doc }) : null;
    const extensions = [
      ...createLatexEditorExtensions({
        mode,
        theme,
        readOnly: isViewerOrReadOnly,
      }),
      ...(binding?.extensions ?? []),
      createEditorKeymap({
        onSave,
        onCompile,
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange?.(update.state.doc.toString());
        }
        if (update.selectionSet) {
          const mainSel = update.state.selection.main;
          const line = update.state.doc.lineAt(mainSel.head);
          setCurrentLine(line.number);
          setCurrentCol(mainSel.head - line.from + 1);
        }
      }),
    ];

    const state = EditorState.create({
      doc: yText?.toString() ?? initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      binding?.undoManager.destroy();
      viewRef.current = null;
    };
  }, [fileId, isViewerOrReadOnly, mode, theme, yText]);

  return (
    <div
      className="latex-editor-shell flex flex-col h-full border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900"
      role="region"
      aria-label="LaTeX Code Editor"
      data-testid="latex-code-editor"
      data-file-id={fileId}
      data-project-id={projectId}
    >
      {/* Banner notices */}
      {isViewerOrReadOnly && (
        <div
          role="status"
          className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs px-3 py-1.5 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between"
          data-testid="readonly-notice"
        >
          <span>
            {userRole === "VIEWER" || userRole === "REVIEWER"
              ? `Read-only mode (${userRole}): Edits are disabled.`
              : "Read-only mode: Edits are disabled."}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded">
            Protected
          </span>
        </div>
      )}

      {errorCode === "NOT_FOUND" && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-xs px-3 py-1.5 border-b border-red-200 dark:border-red-800"
          data-testid="error-not-found"
        >
          File not found or deleted (404). Please close this tab.
        </div>
      )}

      {errorCode === "CONFLICT" && (
        <div
          role="alert"
          className="bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs px-3 py-1.5 border-b border-rose-200 dark:border-rose-800"
          data-testid="error-conflict"
        >
          Version conflict (409): The server has a more recent version. Please refresh and
          reconcile.
        </div>
      )}

      {errorCode === "SERVICE_UNAVAILABLE" && (
        <div
          role="alert"
          className="bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200 text-xs px-3 py-1.5 border-b border-yellow-200 dark:border-yellow-800"
          data-testid="error-service-unavailable"
        >
          Service unavailable (503): Pending edits are held locally. Not yet server-saved.
        </div>
      )}

      {errorMessage && !errorCode && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-xs px-3 py-1.5 border-b border-red-200 dark:border-red-800"
        >
          {errorMessage}
        </div>
      )}

      {/* Editor Main Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto focus:outline-none"
        data-testid="codemirror-container"
      />

      {/* Status Bar */}
      <div
        className="h-7 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 px-3 flex items-center justify-between text-xs text-gray-500 select-none"
        data-testid="editor-status-bar"
      >
        <div className="flex items-center space-x-3">
          <span data-testid="status-mode" className="font-mono text-gray-600 dark:text-gray-400">
            {mode.toUpperCase()}
          </span>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span data-testid="status-cursor">
            Ln {currentLine}, Col {currentCol}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {saveStatus === "saving" && (
            <span
              className="inline-flex items-center text-blue-600 dark:text-blue-400"
              data-testid="save-status-saving"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse mr-1" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span
              className="inline-flex items-center text-green-600 dark:text-green-400"
              data-testid="save-status-saved"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400 mr-1" />
              Saved
            </span>
          )}
          {saveStatus === "offline" && (
            <span
              className="inline-flex items-center text-amber-600 dark:text-amber-400"
              data-testid="save-status-offline"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 mr-1" />
              Offline
            </span>
          )}
          {saveStatus === "error" && (
            <span
              className="inline-flex items-center text-red-600 dark:text-red-400"
              data-testid="save-status-error"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 mr-1" />
              Save error
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
