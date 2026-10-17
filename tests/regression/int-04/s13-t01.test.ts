import { describe, expect, it } from "vitest";
import { getProviderCapabilities } from "../../../apps/api/src/modules/integrations/connections.js";
import { providerErrorSchema } from "@latex-collab/contracts";

describe("INT-04 S13-T01: Mendeley/Papers capability constraints and unpermitted provider handling", () => {
  it("marks Mendeley and Papers as having no permitted capabilities", () => {
    const mendeleyCaps = getProviderCapabilities("mendeley");
    expect(mendeleyCaps).toEqual({
      list: false,
      pull: false,
      push: false,
      individualReferenceImport: false,
    });

    const papersCaps = getProviderCapabilities("papers");
    expect(papersCaps).toEqual({
      list: false,
      pull: false,
      push: false,
      individualReferenceImport: false,
    });
  });

  it("formats BLOCKED_BY_PROVIDER error conforming to provider error contract", () => {
    const error = providerErrorSchema.parse({
      code: "CAPABILITY_UNSUPPORTED",
      retryable: false,
      detail: "Provider integration is BLOCKED_BY_PROVIDER: no legitimate public API or terms access permitted.",
    });

    expect(error.code).toBe("CAPABILITY_UNSUPPORTED");
    expect(error.retryable).toBe(false);
    expect(error.detail).toContain("BLOCKED_BY_PROVIDER");
  });
});
