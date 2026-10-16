import { describe, expect, it } from "vitest";
import { normalizeBibTeX, parseBibTeX } from "../../../packages/latex/src/bib.js";

describe("INT-08 Regression: Preserves source unless safe normalization requested", () => {
  const originalBib = `% My custom comments
@article{key2,
  author = {B Author},
  title = {B Title}
}

% Another comment
@article{key1,
  author = {A Author},
  title = {A Title}
}
`;

  it("opening/parsing .bib preserves original text order and does not reformat", () => {
    const parsed = parseBibTeX(originalBib);
    expect(parsed.entries[0]?.key).toBe("key2");
    expect(parsed.entries[1]?.key).toBe("key1");
    // Raw source preserved
    expect(parsed.entries[0]?.rawSource).toContain("B Author");
  });

  it("normalization explicitly formats and sorts entries only when invoked", () => {
    const normalized = normalizeBibTeX(originalBib, { sortByKey: true });
    expect(normalized).toContain("@article{key1,");
    expect(normalized).toContain("@article{key2,");
    expect(normalized.indexOf("key1")).toBeLessThan(normalized.indexOf("key2"));
  });
});
