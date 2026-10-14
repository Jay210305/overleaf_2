import { describe, expect, it } from "vitest";
import * as Y from "yjs";

describe("NFR-02 Five simultaneous editors convergence through network perturbations (S07-T10)", () => {
  it("guarantees convergence across 5 simultaneous editors despite out-of-order and duplicate packet delivery", () => {
    const clients = 5;
    const clientDocs: Y.Doc[] = [];

    for (let i = 0; i < clients; i++) {
      clientDocs.push(new Y.Doc());
    }

    const updates: Uint8Array[] = [];

    // Each client inserts 10 blocks of text
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < clients; i++) {
        const text = clientDocs[i]!.getText("content");
        text.insert(Math.floor(Math.random() * (text.length + 1)), `[Client ${i + 1} Round ${round}] `);
        updates.push(Y.encodeStateAsUpdate(clientDocs[i]!));
      }
    }

    // Duplicate 20% of updates to test idempotency
    const withDuplicates = [...updates];
    for (let i = 0; i < updates.length; i += 5) {
      withDuplicates.push(updates[i]!);
    }

    // Shuffle to simulate severe reordering
    withDuplicates.sort(() => Math.random() - 0.5);

    // Apply to 5 clean recipient documents
    const finalDocs: Y.Doc[] = [];
    for (let i = 0; i < clients; i++) {
      const doc = new Y.Doc();
      for (const update of withDuplicates) {
        Y.applyUpdate(doc, update);
      }
      finalDocs.push(doc);
    }

    const baseline = finalDocs[0]!.getText("content").toString();
    expect(baseline.length).toBeGreaterThan(0);

    for (let i = 1; i < clients; i++) {
      expect(finalDocs[i]!.getText("content").toString()).toBe(baseline);
    }
  });
});
