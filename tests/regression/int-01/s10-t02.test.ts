import { describe, expect, it } from "vitest";
import {
  extractBibKeys,
  findDuplicateBibKeys,
  insertCitation,
} from "../../../packages/editor/src/citations.js";

describe("INT-01 Regression: BibTeX duplicate key detection and citation completion", () => {
  it("detects duplicate keys with exact line numbers", () => {
    const bib = `@article{knuth1984,
  title = {First}
}
@book{lamport1994,
  title = {Second}
}
@misc{knuth1984,
  title = {Duplicate}
}`;

    const duplicates = findDuplicateBibKeys(bib);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.key).toBe("knuth1984");
    expect(duplicates[0]?.count).toBe(2);
    expect(duplicates[0]?.lines).toEqual([1, 7]);
  });

  it("extracts unique keys when no duplicates exist", () => {
    const bib = `@article{keyA, title = {A}}
@article{keyB, title = {B}}`;
    expect(extractBibKeys(bib)).toEqual(["keyA", "keyB"]);
    expect(findDuplicateBibKeys(bib)).toHaveLength(0);
  });

  it("completes citations inside cite braces", () => {
    const text = "We refer to \\cite{key";
    const res = insertCitation(text, text.length, "keyA");
    expect(res.newText).toBe("We refer to \\cite{keyA}");
  });
});
