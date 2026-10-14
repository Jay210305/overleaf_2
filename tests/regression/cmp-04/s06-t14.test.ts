import { describe, expect, it } from "vitest";
import { assertValidStatusTransition, InvalidStatusTransitionError } from "../../../apps/jobs/src/compilation/lifecycle.js";

describe("CMP-04 Durable status lifecycle transitions (S06-T14)", () => {
  it("never allows a terminal state to transition back to active status", () => {
    const terminals = ["succeeded", "failed", "timed_out", "cancelled"] as const;
    const targets = ["queued", "running", "cancel_requested"] as const;

    for (const from of terminals) {
      for (const to of targets) {
        expect(() => assertValidStatusTransition(from, to)).toThrow(
          InvalidStatusTransitionError,
        );
      }
    }
  });

  it("never marks running job cancelled directly before termination", () => {
    // running -> cancelled is forbidden; running must transition to cancel_requested or terminal
    expect(() => assertValidStatusTransition("running", "cancelled")).toThrow(
      InvalidStatusTransitionError,
    );
  });
});
