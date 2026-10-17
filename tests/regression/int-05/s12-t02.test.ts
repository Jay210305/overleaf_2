import { describe, expect, it } from "vitest";
import { compareManifests } from "../../../apps/api/src/modules/integrations/github-link.js";

/**
 * INT-05 scoped slice of S12-T02: manifest comparison distinguishes
 * only-local, only-remote and differing paths, is sorted, and flags a
 * conflict only when the same path exists with a different kind.
 */
describe("S12-T02 INT-05 manifest comparison", () => {
  it("separates local-only, remote-only and differing paths", () => {
    const { comparison, conflict } = compareManifests(
      [
        { path: "main.tex", kind: "file" },
        { path: "local-only.tex", kind: "file" },
        { path: "assets", kind: "folder" },
      ],
      [
        { path: "main.tex", kind: "file", sizeBytes: 10 },
        { path: "remote-only.tex", kind: "file", sizeBytes: 5 },
        { path: "assets", kind: "file", sizeBytes: 5 },
      ],
    );
    expect(conflict).toBe(true);
    expect(comparison).toEqual([
      { path: "assets", side: "differing", localKind: "folder", remoteKind: "file" },
      { path: "local-only.tex", side: "only-local", localKind: "file", remoteKind: null },
      { path: "remote-only.tex", side: "only-remote", localKind: null, remoteKind: "file" },
    ]);
  });

  it("reports no conflict for disjoint or identical trees", () => {
    expect(compareManifests([], []).conflict).toBe(false);
    expect(
      compareManifests(
        [{ path: "main.tex", kind: "file" }],
        [{ path: "main.tex", kind: "file", sizeBytes: 99 }],
      ),
    ).toEqual({ comparison: [], conflict: false });
  });
});
