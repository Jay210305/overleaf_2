import { describe, expect, it } from "vitest";
import { parseBibTeX } from "../../../packages/latex/src/bib.js";

describe("INT-01 Regression: BibTeX duplicate key detection", () => {
  it("detects duplicate keys and returns accurate counts and lines", () => {
    const bib = `@article{dupKey, title={First}}
@article{uniqueKey, title={Second}}
@article{dupKey, title={Third}}`;

    const { duplicateKeys } = parseBibTeX(bib);
    expect(duplicateKeys).toHaveLength(1);
    expect(duplicateKeys[0]?.key).toBe("dupKey");
    expect(duplicateKeys[0]?.count).toBe(2);
    expect(duplicateKeys[0]?.lines).toEqual([1, 3]);
  });
});
