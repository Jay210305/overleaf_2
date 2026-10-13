import {
  keymap,
  type KeyBinding,
} from "@codemirror/view";
import {
  undo,
  redo,
  indentWithTab,
} from "@codemirror/commands";
import {
  openSearchPanel,
  closeSearchPanel,
} from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import * as Y from "yjs";

export interface EditorShortcutCallbacks {
  onSave?: (() => void) | undefined;
  onCompile?: (() => void) | undefined;
  onGoToLine?: ((lineNumber?: number) => void) | undefined;
  onCommentToggle?: (() => void) | undefined;
}

/**
 * Creates custom keymap bindings for LaTeX code editor.
 * Includes Mod-s (Save), Mod-Enter (Compile), Mod-/ (Comment toggle),
 * Mod-z / Mod-Shift-z (Undo/Redo), Mod-f (Search), Tab (Indent).
 */
export function createEditorKeymap(callbacks: EditorShortcutCallbacks = {}): Extension {
  const bindings: KeyBinding[] = [
    indentWithTab,
    {
      key: "Mod-s",
      run: () => {
        if (callbacks.onSave) {
          callbacks.onSave();
          return true;
        }
        return false;
      },
    },
    {
      key: "Mod-Enter",
      run: () => {
        if (callbacks.onCompile) {
          callbacks.onCompile();
          return true;
        }
        return false;
      },
    },
    {
      key: "Mod-/",
      run: (view) => {
        // Toggle LaTeX comment (%) on selected lines
        const doc = view.state.doc;
        const selection = view.state.selection.main;
        const startLine = doc.lineAt(selection.from);
        const endLine = doc.lineAt(selection.to);

        const changes: { from: number; to: number; insert: string }[] = [];
        let allCommented = true;

        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = doc.line(i);
          if (!line.text.trimStart().startsWith("%")) {
            allCommented = false;
            break;
          }
        }

        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = doc.line(i);
          if (allCommented) {
            // Remove first %
            const pctIdx = line.text.indexOf("%");
            if (pctIdx >= 0) {
              const removeLen = line.text[pctIdx + 1] === " " ? 2 : 1;
              changes.push({ from: line.from + pctIdx, to: line.from + pctIdx + removeLen, insert: "" });
            }
          } else {
            // Add %
            changes.push({ from: line.from, to: line.from, insert: "% " });
          }
        }

        if (changes.length > 0) {
          view.dispatch({ changes });
        }
        if (callbacks.onCommentToggle) {
          callbacks.onCommentToggle();
        }
        return true;
      },
    },
    {
      key: "Mod-g",
      run: () => {
        if (callbacks.onGoToLine) {
          callbacks.onGoToLine();
          return true;
        }
        return false;
      },
    },
    {
      key: "Mod-f",
      run: openSearchPanel,
      scope: "editor",
    },
    {
      key: "Escape",
      run: closeSearchPanel,
      scope: "editor",
    },
    {
      key: "Mod-z",
      run: undo,
    },
    {
      key: "Mod-y",
      run: redo,
    },
    {
      key: "Mod-Shift-z",
      run: redo,
    },
  ];

  return keymap.of(bindings);
}

/**
 * Scoped Y.UndoManager helper that only tracks and reverts local origin mutations,
 * preventing local undo from reversing remote collaborators' changes.
 */
export function createScopedUndoManager(type: Y.Text, localOrigin: symbol | string): Y.UndoManager {
  return new Y.UndoManager(type, {
    trackedOrigins: new Set([localOrigin]),
  });
}

export interface SearchMatch {
  fileId: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
  startIndex: number;
  endIndex: number;
}

export interface SearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  replacement?: string;
}

/**
 * Project-wide search across multiple file buffers.
 * Supports exact string, case sensitivity, and regex with preview.
 */
export function searchAcrossFiles(
  files: Array<{ id: string; name: string; content: string }>,
  options: SearchOptions,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  if (!options.query) return matches;

  let pattern: RegExp;
  try {
    if (options.isRegex) {
      pattern = new RegExp(options.query, options.caseSensitive ? "g" : "gi");
    } else {
      const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp(escaped, options.caseSensitive ? "g" : "gi");
    }
  } catch {
    return matches;
  }

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx] ?? "";
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(lineText)) !== null) {
        matches.push({
          fileId: file.id,
          fileName: file.name,
          lineNumber: lineIdx + 1,
          lineContent: lineText,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        if (!pattern.global) break;
      }
    }
  }

  return matches;
}

/**
 * Preview replacement across matches without modifying originals.
 */
export function previewReplace(
  lineContent: string,
  startIndex: number,
  endIndex: number,
  replacement: string,
): string {
  return lineContent.slice(0, startIndex) + replacement + lineContent.slice(endIndex);
}
