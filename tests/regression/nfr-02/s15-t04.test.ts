import { describe, expect, it } from "vitest";
import * as Y from "yjs";

describe("NFR-02 S15-T04: Five simultaneous editors cross-replica convergence regression", () => {
  it("converges five concurrent editors distributed across replicas without data loss or ordering conflict", () => {
    const numEditors = 5;
    const initialText =
      "\\documentclass{article}\n\\begin{document}\n\\section{Collaborative Multi-Replica}\n\\end{document}\n";

    // Create 5 client documents initialized with the same base state
    const baseDoc = new Y.Doc();
    baseDoc.getText("content").insert(0, initialText);
    const baseState = Y.encodeStateAsUpdate(baseDoc);

    const editorDocs: Y.Doc[] = [];
    for (let i = 0; i < numEditors; i++) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, baseState);
      editorDocs.push(doc);
    }

    // Each editor simulates concurrent typing (replicas 1 and 2 interleaved)
    const allUpdates: Array<{ editorIdx: number; update: Uint8Array }> = [];

    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < numEditors; i++) {
        const doc = editorDocs[i]!;
        const ytext = doc.getText("content");
        const insertPos = Math.min(ytext.length, 40 + i * 10);
        const snippet = `% Edit from Editor ${i + 1} Round ${round}\n`;

        const stateBefore = Y.encodeStateVector(doc);
        doc.transact(() => {
          ytext.insert(insertPos, snippet);
        });

        const update = Y.encodeStateAsUpdate(doc, stateBefore);
        allUpdates.push({ editorIdx: i, update });
      }
    }

    // Shuffle update delivery order to simulate asynchronous network transit across replicas
    const randomized = [...allUpdates].sort(() => Math.random() - 0.5);

    // Apply all updates to each editor's document
    for (const item of randomized) {
      for (let i = 0; i < numEditors; i++) {
        if (i !== item.editorIdx) {
          Y.applyUpdate(editorDocs[i]!, item.update);
        }
      }
    }

    // Verify all 5 editors converged on 100% identical content
    const canonicalText = editorDocs[0]!.getText("content").toString();
    expect(canonicalText.length).toBeGreaterThan(initialText.length);

    for (let i = 1; i < numEditors; i++) {
      expect(editorDocs[i]!.getText("content").toString()).toBe(canonicalText);
    }

    // Verify that every single editor's contributions are present in the converged text
    for (let i = 0; i < numEditors; i++) {
      for (let round = 0; round < 5; round++) {
        expect(canonicalText).toContain(`% Edit from Editor ${i + 1} Round ${round}\n`);
      }
    }
  });
});
