import { describe, expect, it } from "vitest";
import {
  validateIfMatchHeader,
  checkTextRevisionConcurrency,
} from "../../../apps/api/src/modules/files/version-guard.js";

describe("EDT-02 S04-T06 Metadata and text concurrency guard rejection", () => {
  it("rejects mismatched If-Match revision with 412 PRECONDITION_FAILED", () => {
    // Current revision is 5
    expect(() => validateIfMatchHeader('"5"', 5)).not.toThrow();
    expect(() => validateIfMatchHeader(undefined, 5)).not.toThrow();

    expect(() => validateIfMatchHeader('"4"', 5)).toThrowError(
      expect.objectContaining({ status: 412, code: "PRECONDITION_FAILED" }),
    );
  });

  it("rejects mismatched CRDT state vector with 409 REVISION_CONFLICT", () => {
    expect(() =>
      checkTextRevisionConcurrency("expected-vector-b64", "expected-vector-b64"),
    ).not.toThrow();

    expect(() =>
      checkTextRevisionConcurrency("current-server-vector", "stale-client-vector"),
    ).toThrowError(
      expect.objectContaining({ status: 409, code: "REVISION_CONFLICT" }),
    );
  });
});
