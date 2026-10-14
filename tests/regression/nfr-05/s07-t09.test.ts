import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-05 Remote edit propagation latency p95 <= 300ms (S07-T09)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("propagates remote edits with p95 <= 300ms on the reference network", async () => {
    const fileId = fixture.fileId;

    const ticketA = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const ticketB = await fixture.getTicket(fixture.editor.email, fileId, "read");

    const clientA = await fixture.createClient(ticketA);
    const clientB = await fixture.createClient(ticketB);

    const docA = new Y.Doc();
    const latencies: number[] = [];
    const iterations = 20;

    for (let i = 0; i < iterations; i++) {
      const peerMsgPromise = clientB.waitForMessage((m) => m.type === "sync.update");

      docA.getText("content").insert(docA.getText("content").length, `Char ${i}`);
      const update = Y.encodeStateAsUpdate(docA);

      const start = Date.now();
      await clientA.sendUpdate(update);
      await peerMsgPromise;
      const elapsed = Date.now() - start;

      latencies.push(elapsed);
    }

    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Index]!;

    expect(p95).toBeLessThanOrEqual(300);

    await clientA.close();
    await clientB.close();
  });
});
