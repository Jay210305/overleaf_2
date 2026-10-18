import { describe, expect, it } from "vitest";
import { parseBibTeX } from "@latex-collab/latex";

describe("INT-08 S13-T05: Safe reference import source preservation", () => {
  it("preserves exotic formatting, macros, and comments when appending new reference", () => {
    const originalBib = `% Custom header comment
@string{IEEE = "IEEE Transactions"}

@article{custom2020,
    author = {Doe, John},
    title = {Article Title with {Special} Characters \\& $math$},
    journal = IEEE
}
`;

    const newEntry = `@book{turing1936,
  author = {Alan Turing},
  title = {Computable Numbers}
}`;

    // Appending raw source verbatim preserves original text exactly
    const combined = `${originalBib}\n${newEntry}\n`;
    expect(combined).toContain("% Custom header comment");
    expect(combined).toContain('@string{IEEE = "IEEE Transactions"}');
    expect(combined).toContain("Article Title with {Special} Characters \\& $math$");

    const parsed = parseBibTeX(combined);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries.map((e) => e.key)).toEqual(["custom2020", "turing1936"]);
  });
});
