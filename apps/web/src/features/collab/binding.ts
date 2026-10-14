import * as Y from "yjs";
import { type Extension, keymap } from "@latex-collab/editor";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

export interface CollabBindingOptions {
  doc: Y.Doc;
  fieldName?: string;
  localOrigin?: unknown;
  awareness?: unknown;
}

export interface CollabBindingResult {
  ytext: Y.Text;
  undoManager: Y.UndoManager;
  localOrigin: unknown;
  extensions: Extension[];
}

/**
 * Creates a collaborative CodeMirror 6 extension with isolated undo.
 * Enforces:
 * 1. Binding uses stable pinned y-codemirror.next 0.3.5 and Yjs 13.
 * 2. Y.UndoManager tracks ONLY localOrigin so User A undo leaves User B edits intact.
 */
export function createCollabBinding(options: CollabBindingOptions): CollabBindingResult {
  const { doc, fieldName = "content", localOrigin = { type: "local-user" }, awareness } = options;
  const ytext = doc.getText(fieldName);

  // UndoManager isolated strictly to localOrigin transactions
  const undoManager = new Y.UndoManager(ytext, {
    trackedOrigins: new Set([localOrigin]),
  });

  const extensions: Extension[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yCollab(ytext, awareness as any, { undoManager }),
    keymap.of(yUndoManagerKeymap),
  ];

  return {
    ytext,
    undoManager,
    localOrigin,
    extensions,
  };
}

/**
 * Inserts text from a local client with local origin tracking.
 */
export function applyLocalInsert(
  doc: Y.Doc,
  ytext: Y.Text,
  index: number,
  text: string,
  localOrigin: unknown,
): void {
  doc.transact(() => {
    ytext.insert(index, text);
  }, localOrigin);
}

/**
 * Applies a remote edit without local origin tracking so it will NOT be undone by local undo.
 */
export function applyRemoteInsert(
  doc: Y.Doc,
  ytext: Y.Text,
  index: number,
  text: string,
  remoteOrigin: unknown = "remote",
): void {
  doc.transact(() => {
    ytext.insert(index, text);
  }, remoteOrigin);
}
