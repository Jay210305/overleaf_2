import { describe, expect, it } from "vitest";
import {
  TextSaveCoordinator,
  type SaveTransport,
} from "../../../apps/web/src/features/editor/persistence.js";
import type { ApplyTextUpdateInput } from "@latex-collab/contracts";

describe("EDT-02 S04-T08 Accurate save status for Unicode edits", () => {
  it("transitions saving to saved only upon DurableAck for Unicode payload", async () => {
    let savedInput: ApplyTextUpdateInput | null = null;
    const transport: SaveTransport = {
      async save(projectId: string, fileId: string, input: ApplyTextUpdateInput) {
        savedInput = input;
        return {
          ack: {
            type: "text.durable_ack",
            version: 1,
            fileId,
            persistedSeq: 7,
            stateVectorBase64: input.baseStateVectorBase64,
          },
        };
      },
    };

    const coordinator = new TextSaveCoordinator({
      projectId: "proj-unicode",
      fileId: "file-unicode",
      transport,
    });

    expect(coordinator.getStatus()).toBe("saved");

    const unicodeUpdateB64 = Buffer.from("Ácentos y emojis 🚀").toString("base64");
    const p = coordinator.enqueue(unicodeUpdateB64, "vector-base");
    expect(coordinator.getStatus()).toBe("saving");

    const ack = await p;
    expect(ack.persistedSeq).toBe(7);
    expect(coordinator.getStatus()).toBe("saved");
    expect((savedInput as ApplyTextUpdateInput | null)?.updateBase64).toBe(unicodeUpdateB64);

    coordinator.destroy();
  });
});
