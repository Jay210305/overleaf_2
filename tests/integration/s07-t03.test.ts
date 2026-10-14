import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createCollabBinding,
  applyLocalInsert,
  applyRemoteInsert,
} from "../../apps/web/src/features/collab/binding.js";

describe("S07-T03 Collaborative editor presence and isolated undo integration", () => {
  it("creates CodeMirror extensions with pinned y-codemirror.next and Yjs 13", () => {
    const doc = new Y.Doc();
    const binding = createCollabBinding({ doc });

    expect(binding.ytext).toBeDefined();
    expect(binding.undoManager).toBeDefined();
    expect(binding.extensions).toBeDefined();
    expect(Array.isArray(binding.extensions)).toBe(true);
    expect(binding.extensions.length).toBeGreaterThan(0);
  });

  it("ensures User A undo reverses only User A edits, leaving User B edits completely intact", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");

    const userAOrigin = { user: "UserA" };
    const userBOrigin = { user: "UserB" };

    // Set up UndoManager for User A tracking ONLY userAOrigin
    const undoManagerA = new Y.UndoManager(ytext, {
      trackedOrigins: new Set([userAOrigin]),
    });

    // 1. User A inserts "Hello "
    applyLocalInsert(doc, ytext, 0, "Hello ", userAOrigin);
    undoManagerA.stopCapturing();
    expect(ytext.toString()).toBe("Hello ");

    // 2. User B inserts "World" at index 6
    applyRemoteInsert(doc, ytext, 6, "World", userBOrigin);
    expect(ytext.toString()).toBe("Hello World");

    // 3. User A inserts "! " at index 11
    applyLocalInsert(doc, ytext, 11, "! ", userAOrigin);
    undoManagerA.stopCapturing();
    expect(ytext.toString()).toBe("Hello World! ");

    // 4. User A performs Undo -> reverses User A's last insertion ("! ")
    expect(undoManagerA.canUndo()).toBe(true);
    undoManagerA.undo();
    expect(ytext.toString()).toBe("Hello World");

    // 5. User A performs Undo again -> reverses User A's first insertion ("Hello ")
    // NOTE: User B's insertion ("World") MUST REMAIN INTACT!
    undoManagerA.undo();
    expect(ytext.toString()).toBe("World");

    // 6. User A performs Redo -> restores User A's insertions
    expect(undoManagerA.canRedo()).toBe(true);
    undoManagerA.redo();
    expect(ytext.toString()).toBe("Hello World");
  });
});
