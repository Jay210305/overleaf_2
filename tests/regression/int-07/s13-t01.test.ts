import { describe, expect, it } from "vitest";
import { getProviderCapabilities } from "../../../apps/api/src/modules/integrations/connections.js";
import { syncConflictSchema, syncInputSchema, syncResultSchema } from "@latex-collab/contracts";

describe("INT-07 S13-T01: Dropbox capability model, revocation, and conflict schema invariants", () => {
  it("enforces Dropbox capability model: list, pull, and push enabled, individual import false", () => {
    const caps = getProviderCapabilities("dropbox");
    expect(caps).toEqual({
      list: true,
      pull: true,
      push: true,
      individualReferenceImport: false,
    });
  });

  it("validates sync input and conflict representations", () => {
    const syncInput = syncInputSchema.parse({
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-local-001",
      expectedRemoteRevision: "rev-remote-001",
      resourceId: "/Apps/Overleaf/Paper",
    });
    expect(syncInput.expectedRemoteRevision).toBe("rev-remote-001");

    const conflict = syncConflictSchema.parse({
      path: "main.tex",
      kind: "text",
    });
    expect(conflict.kind).toBe("text");

    const result = syncResultSchema.parse({
      status: "conflict",
      remoteRevision: "rev-remote-002",
      localRevisionId: "rev-local-001",
      conflicts: [conflict],
    });
    expect(result.status).toBe("conflict");
    expect(result.conflicts).toHaveLength(1);
  });
});
