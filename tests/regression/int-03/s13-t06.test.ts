import { describe, expect, it } from "vitest";
import { ZoteroSyncAdapter } from "../../../apps/jobs/src/sync/zotero.js";

describe("INT-03 S13-T06: Zotero contract and token protection invariants", () => {
  it("never exposes decrypted tokens in sync results or error details", async () => {
    const rawSecretToken = "zotero-super-secret-token-1234567890";
    const adapter = new ZoteroSyncAdapter({
      fetcher: async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    });

    const res = await adapter.connect(rawSecretToken, "state");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.detail).not.toContain(rawSecretToken);
    }
  });
});
