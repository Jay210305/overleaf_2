import { describe, expect, it } from "vitest";
import {
  TextSaveCoordinator,
  type SaveTransport,
  type SaveStatus,
} from "../../../apps/web/src/features/editor/persistence.js";
import type { ApplyTextUpdateInput } from "@latex-collab/contracts";

describe("EDT-02 S04-T03 Save status indicators and overwrite rejection", () => {
  it("displays saving/saved/offline/error accurately throughout lifecycle", async () => {
    let onlineState = true;
    let failMode: "none" | "offline" | "503" | "409" = "none";
    const transitions: SaveStatus[] = [];

    const transport: SaveTransport = {
      async save(projectId: string, fileId: string, input: ApplyTextUpdateInput) {
        if (!onlineState) {
          throw new Error("Failed to fetch: Network offline");
        }
        if (failMode === "503") {
          throw { status: 503, code: "SERVICE_UNAVAILABLE", message: "Server degraded" };
        }
        if (failMode === "409") {
          throw { status: 409, code: "REVISION_CONFLICT", message: "Version conflict" };
        }
        return {
          ack: {
            type: "text.durable_ack",
            version: 1,
            fileId,
            persistedSeq: 42,
            stateVectorBase64: input.baseStateVectorBase64,
          },
        };
      },
    };

    const coordinator = new TextSaveCoordinator({
      projectId: "test-proj",
      fileId: "test-file",
      transport,
      isOnline: () => onlineState,
      onStatusChange: (s) => transitions.push(s),
      initialBackoffMs: 25,
    });

    expect(coordinator.getStatus()).toBe("saved");

    // 1. Happy path: saved -> saving -> saved
    const p1 = coordinator.enqueue("u1", "v1");
    expect(coordinator.getStatus()).toBe("saving");
    await p1;
    expect(coordinator.getStatus()).toBe("saved");

    // 2. Offline transition:
    onlineState = false;
    const pOffline = coordinator.enqueue("u2", "v2");
    expect(coordinator.getStatus()).toBe("offline");
    expect(coordinator.getPendingCount()).toBe(1);

    // Turn online back on and retry
    onlineState = true;
    await coordinator.retry();
    await pOffline;
    expect(coordinator.getStatus()).toBe("saved");

    // 3. Reject racing overwrite (409)
    failMode = "409";
    await expect(coordinator.enqueue("u3", "v3")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()?.code).toBe("CONFLICT");

    coordinator.destroy();
  });
});
