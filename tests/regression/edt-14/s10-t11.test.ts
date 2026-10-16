import { describe, it, expect, vi } from "vitest";
import {
  lookupErrorHelp,
  searchHelpCatalog,
} from "../../../apps/web/src/features/help/latex-help.js";

describe("Regression EDT-14: Static error help operates offline without external telemetry", () => {
  it("diagnoses mismatched environment error completely locally", () => {
    const errorText = "\\begin{equation} ended by \\end{align}";
    const help = lookupErrorHelp(errorText);

    expect(help).toBeDefined();
    expect(help?.title).toBe("Mismatched Environment");
    expect(help?.category).toBe("environment");
  });

  it("handles empty or unmatched error messages gracefully", () => {
    expect(lookupErrorHelp("")).toBeNull();
    expect(lookupErrorHelp("Custom non-standard error line")).toBeNull();
  });

  it("ensures zero network activity when querying static help", () => {
    const globalFetchSpy = vi.fn();
    // In node/browser environments
    vi.stubGlobal("fetch", globalFetchSpy);

    const help1 = lookupErrorHelp("Emergency stop");
    const results = searchHelpCatalog("undefined");

    expect(help1?.title).toBe("Emergency Stop");
    expect(results.length).toBeGreaterThan(0);
    expect(globalFetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
