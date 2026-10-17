import { describe, expect, it } from "vitest";
import { detectDuplicateKeys } from "../../../apps/api/src/modules/references/import.js";

describe("INT-01 S13-T05: Duplicate key detection during reference import", () => {
  it("detects existing keys case-insensitively and returns duplicate report", () => {
    const existing = `@article{Knuth1984,
  author = {Donald Knuth},
  title = {The TeXbook}
}

@article{Lamport1994,
  author = {Leslie Lamport},
  title = {LaTeX}
}`;

    const duplicates = detectDuplicateKeys(existing, ["knuth1984", "NewEntry2024", "LAMPORT1994"]);
    expect(duplicates).toEqual(["knuth1984", "LAMPORT1994"]);
  });

  it("returns empty duplicates array when no collisions occur", () => {
    const existing = `@article{einstein1905, title={Relativity}}`;
    const duplicates = detectDuplicateKeys(existing, ["bohr1913", "curie1911"]);
    expect(duplicates).toEqual([]);
  });
});
