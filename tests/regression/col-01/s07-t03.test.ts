import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  applyLocalInsert,
  applyRemoteInsert,
} from "../../../apps/web/src/features/collab/binding.js";

describe("COL-01 Concurrent editing and isolated undo convergence (S07-T03)", () => {
  it("isolates undo transactions so undoing user A does not revert user B concurrent edits", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const originA = "client-A";
    const originB = "client-B";

    const textA = docA.getText("content");
    const textB = docB.getText("content");

    // Client A tracks only originA
    const undoManagerA = new Y.UndoManager(textA, {
      trackedOrigins: new Set([originA]),
    });

    // Client B tracks only originB
    const undoManagerB = new Y.UndoManager(textB, {
      trackedOrigins: new Set([originB]),
    });

    // Step 1: Client A types "\section{Introduction}"
    applyLocalInsert(docA, textA, 0, "\\section{Introduction}\n", originA);
    undoManagerA.stopCapturing();

    // Sync A -> B
    const update1 = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, update1, "sync");

    expect(textA.toString()).toBe("\\section{Introduction}\n");
    expect(textB.toString()).toBe("\\section{Introduction}\n");

    // Step 2: Client B appends "Hello from B."
    applyLocalInsert(docB, textB, textB.length, "Hello from B.\n", originB);
    undoManagerB.stopCapturing();

    // Step 3: Concurrently Client A appends "Hello from A."
    applyLocalInsert(docA, textA, textA.length, "Hello from A.\n", originA);
    undoManagerA.stopCapturing();

    // Sync B -> A
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    applyRemoteInsert(docA, textA, 0, "", "sync"); // or apply update
    Y.applyUpdate(docA, updateB, "sync");

    // Sync A -> B
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    Y.applyUpdate(docB, updateA, "sync");

    // Both converged before undo
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("Hello from A.\n");
    expect(textA.toString()).toContain("Hello from B.\n");

    // Step 4: Client A performs Undo -> reverts "Hello from A.\n"
    expect(undoManagerA.canUndo()).toBe(true);
    undoManagerA.undo();

    // Verify Doc A has undone A's edit but B's edit is STILL INTACT!
    expect(textA.toString()).not.toContain("Hello from A.\n");
    expect(textA.toString()).toContain("Hello from B.\n");
    expect(textA.toString()).toContain("\\section{Introduction}\n");

    // Step 5: Sync undo update from A -> B
    const updateUndoA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    Y.applyUpdate(docB, updateUndoA, "sync");

    // Both docs converged after isolated undo
    expect(textB.toString()).toBe(textA.toString());
    expect(textB.toString()).not.toContain("Hello from A.\n");
    expect(textB.toString()).toContain("Hello from B.\n");
  });
});
