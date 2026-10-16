import { describe, expect, it } from "vitest";
import { countLatexWords } from "../../packages/latex/src/word-count.js";

describe("S10-T07 Integration: Report documented project statistics", () => {
  it("computes accurate approximate word count for standard LaTeX documents", () => {
    const doc = `\\documentclass{article}
\\usepackage{amsmath}
% This is a comment that should be ignored
\\begin{document}

\\section{Introduction}
This is a test document with exactly ten words in it.

\\end{document}`;

    const res = countLatexWords(doc);
    expect(res.approximate).toBe(true);
    // "Introduction" (1) + "This is a test document with exactly ten words in it." (11) = 12 words
    expect(res.words).toBe(12);
    expect(res.characters).toBeGreaterThan(0);
    expect(res.charactersExcludingSpaces).toBeGreaterThan(0);
    expect(res.parserNotes).toContain("Comments and preamble excluded");
  });

  it("excludes math formulas and citation commands from word count", () => {
    const doc = `\\documentclass{article}
\\begin{document}
Here is text \\cite{knuth1984} with inline math $x^2 + y^2 = z^2$ and an equation:
\\begin{equation}
\\int_{0}^{1} f(x) dx = 0
\\end{equation}
Final concluding sentence.
\\end{document}`;

    const res = countLatexWords(doc);
    // "Here is text with inline math and an equation: Final concluding sentence." = 12 words
    // Knuth citation key and equations are stripped
    expect(res.words).toBe(12);
  });

  it("preserves formatted text inside text styling commands", () => {
    const doc = `\\documentclass{article}
\\begin{document}
\\textbf{Bold text} and \\textit{italic text} with \\emph{emphasized text}.
\\end{document}`;

    const res = countLatexWords(doc);
    // "Bold text and italic text with emphasized text." = 8 words
    expect(res.words).toBe(8);
  });

  it("handles empty or whitespace documents gracefully", () => {
    const res = countLatexWords("");
    expect(res.words).toBe(0);
    expect(res.characters).toBe(0);
    expect(res.parserNotes).toContain("Empty source");

    const res2 = countLatexWords("   \n\t  ");
    expect(res2.words).toBe(0);
  });
});
