import { describe, it, expect } from "vitest";
import { checkSpelling, levenshteinDistance } from "@latex-collab/editor";
import {
  lookupErrorHelp,
  searchHelpCatalog,
  STATIC_ERROR_CATALOG,
} from "../../apps/web/src/features/help/latex-help.js";

describe("S10-T11: Local Spell Checking and Static Error Help", () => {
  it("calculates levenshtein distance correctly", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("latex", "latex")).toBe(0);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("identifies spelling mistakes in plain prose and offers suggestions", () => {
    const text = "This is a reesult of our experimnt.";
    const errors = checkSpelling(text);

    expect(errors.length).toBe(2);
    expect(errors[0]?.word).toBe("reesult");
    expect(errors[0]?.suggestions).toContain("result");
    expect(errors[1]?.word).toBe("experimnt");
    expect(errors[1]?.suggestions).toContain("experiment");
  });

  it("strictly ignores LaTeX commands and macros during spell check (EDT-11)", () => {
    const latex = `
\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\section{Introduction}
Here is an introduction with quantum mechanics.
\\cite{einstein1935}
\\label{sec:intro}
\\end{document}
`;
    const errors = checkSpelling(latex);
    expect(errors).toEqual([]);
  });

  it("strictly ignores inline math and display math environments", () => {
    const text =
      "The equation $E = mc^2$ and \\begin{equation} x + y = z \\end{equation} are valid. Also \\[ unknownmathvar + complexsym = 0 \\] and $$ anothermathsym = 1 $$ are ignored.";
    const errors = checkSpelling(text);
    expect(errors).toEqual([]);
  });

  it("strictly ignores TeX comments", () => {
    const text = "This is good text. % asdfghjk qwertyuiop not a word";
    const errors = checkSpelling(text);
    expect(errors).toEqual([]);
  });

  it("accepts custom project words to extend dictionary", () => {
    const text = "We evaluate the Overleaf platform.";
    const errorsBefore = checkSpelling(text);
    expect(errorsBefore.some((e) => e.word.toLowerCase() === "overleaf")).toBe(true);

    const errorsAfter = checkSpelling(text, ["Overleaf"]);
    expect(errorsAfter.some((e) => e.word.toLowerCase() === "overleaf")).toBe(false);
  });

  it("looks up static help entries offline without network requests (EDT-14)", () => {
    const errorMsg = "! Undefined control sequence. l.12 \\myunknowncmd";
    const help = lookupErrorHelp(errorMsg);

    expect(help).not.toBeNull();
    expect(help?.title).toBe("Undefined Control Sequence");
    expect(help?.suggestedFix).toContain("\\usepackage");
  });

  it("searches error catalog offline by keywords", () => {
    const results = searchHelpCatalog("math");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category === "math")).toBe(true);
  });

  it("returns empty or all entries appropriately on empty search query", () => {
    const all = searchHelpCatalog("");
    expect(all.length).toBe(STATIC_ERROR_CATALOG.length);
  });
});
