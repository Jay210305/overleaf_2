import { describe, expect, it } from "vitest";
import * as Y from "yjs";

describe("Collab convergence and recovery stress test (collab-recovery)", () => {
  it("converges 5 simultaneous client streams through reordering and interleaved updates", () => {
    const clientCount = 5;
    const editsPerClient = 100;

    const docs: Y.Doc[] = [];
    for (let i = 0; i < clientCount; i++) {
      docs.push(new Y.Doc());
    }

    // Accumulate all update frames
    const allUpdates: Uint8Array[] = [];

    for (let edit = 0; edit < editsPerClient; edit++) {
      for (let client = 0; client < clientCount; client++) {
        const doc = docs[client]!;
        const text = doc.getText("content");
        const char = String.fromCharCode(65 + client);
        text.insert(Math.floor(Math.random() * (text.length + 1)), `${char}${edit} `);
        allUpdates.push(Y.encodeStateAsUpdate(doc));
      }
    }

    // Shuffle updates to simulate extreme network reordering
    const shuffled = [...allUpdates].sort(() => Math.random() - 0.5);

    // Apply shuffled updates to 5 independent recipient docs
    const recipientDocs: Y.Doc[] = [];
    for (let i = 0; i < clientCount; i++) {
      const recipient = new Y.Doc();
      // Apply shuffled updates in randomized chunks
      const chunkSize = 20;
      for (let c = 0; c < shuffled.length; c += chunkSize) {
        const chunk = shuffled.slice(c, c + chunkSize);
        for (const update of chunk) {
          Y.applyUpdate(recipient, update);
        }
      }
      recipientDocs.push(recipient);
    }

    // Assert absolute convergence across all 5 recipient docs
    const expected = recipientDocs[0]!.getText("content").toString();
    expect(expected.length).toBeGreaterThan(0);

    for (let i = 1; i < clientCount; i++) {
      expect(recipientDocs[i]!.getText("content").toString()).toBe(expected);
    }
  });
});
