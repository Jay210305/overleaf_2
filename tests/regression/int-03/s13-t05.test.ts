import { describe, expect, it } from "vitest";
import { getProviderCapabilities } from "../../../apps/api/src/modules/integrations/connections.js";

describe("INT-03 S13-T05: Zotero provider capabilities and individual reference import invariant", () => {
  it("authorizes individual reference import for Zotero while maintaining read-only push", () => {
    const caps = getProviderCapabilities("zotero");
    expect(caps.individualReferenceImport).toBe(true);
    expect(caps.push).toBe(false);
    expect(caps.pull).toBe(true);
    expect(caps.list).toBe(true);
  });
});
