import { describe, expect, it } from "vitest";
import { verifyFrozenLocal } from "../../../apps/jobs/src/sync/apply-changes.js";
import { GitHubPullError, type PullEntry } from "../../../apps/jobs/src/sync/github-pull.js";

const sha = (c: string) => c.repeat(40);

const entry = (overrides: Partial<PullEntry> = {}): PullEntry => ({
  path: "main.tex",
  action: "update",
  localKind: "text",
  remoteKind: "file",
  localFingerprint: "fp-1",
  remoteSha: sha("a"),
  sizeBytes: 10,
  ...overrides,
});

const rejectsWith = (run: () => unknown, status: number, code: string) => {
  try {
    run();
    throw new Error("expected the frozen-state guard to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubPullError);
    const pullError = error as GitHubPullError;
    expect(pullError.status).toBe(status);
    expect(pullError.code).toBe(code);
  }
};

describe("COL-12 S12-T08 frozen local state guards", () => {
  it("accepts untouched text and binary files for update and delete", () => {
    expect(() =>
      verifyFrozenLocal(entry(), { exists: true, kind: "text", fingerprint: "fp-1" }),
    ).not.toThrow();
    expect(() =>
      verifyFrozenLocal(entry({ action: "delete" }), {
        exists: true,
        kind: "text",
        fingerprint: "fp-1",
      }),
    ).not.toThrow();
    expect(() =>
      verifyFrozenLocal(entry({ localKind: "binary", localFingerprint: "fp-b" }), {
        exists: true,
        kind: "binary",
        fingerprint: "fp-b",
      }),
    ).not.toThrow();
  });

  it("rejects a concurrent local edit with REVISION_CONFLICT", () => {
    rejectsWith(
      () => verifyFrozenLocal(entry(), { exists: true, kind: "text", fingerprint: "fp-2" }),
      409,
      "REVISION_CONFLICT",
    );
  });

  it("rejects a concurrent local delete of a file the plan still updates", () => {
    rejectsWith(
      () => verifyFrozenLocal(entry(), { exists: false, kind: null, fingerprint: null }),
      409,
      "REVISION_CONFLICT",
    );
  });

  it("rejects a concurrent kind change on the local file", () => {
    rejectsWith(
      () =>
        verifyFrozenLocal(entry({ localKind: "binary", localFingerprint: "fp-b" }), {
          exists: true,
          kind: "text",
          fingerprint: "fp-1",
        }),
      409,
      "REVISION_CONFLICT",
    );
  });

  it("accepts an add while the path is still absent locally", () => {
    expect(() =>
      verifyFrozenLocal(
        entry({ action: "add", localKind: null, localFingerprint: null, remoteSha: sha("b") }),
        { exists: false, kind: null, fingerprint: null },
      ),
    ).not.toThrow();
  });

  it("rejects an add when the path appeared locally after the plan", () => {
    rejectsWith(
      () =>
        verifyFrozenLocal(
          entry({ action: "add", localKind: null, localFingerprint: null, remoteSha: sha("b") }),
          { exists: true, kind: "text", fingerprint: "fp-new" },
        ),
      409,
      "REVISION_CONFLICT",
    );
  });

  it("leaves non-actionable plan entries untouched", () => {
    for (const action of ["keep-local", "keep-deleted", "unchanged"] as const) {
      expect(() =>
        verifyFrozenLocal(entry({ action }), {
          exists: false,
          kind: null,
          fingerprint: null,
        }),
      ).not.toThrow();
    }
  });
});
