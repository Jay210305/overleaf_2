import { describe, expect, it } from "vitest";
import { countLatexWords } from "../../../packages/latex/src/word-count.js";

describe("PRO-15 Regression: LaTeX word count and statistics reporting", () => {
  it("excludes comments and preserves core prose", () => {
    const latex = `\\documentclass{article}
% Header comment
\\begin{document}
% First paragraph comment
Word one word two.
% Intermediate comment
Word three.
\\end{document}
% Trailing comment`;

    const stats = countLatexWords(latex);
    expect(stats.words).toBe(6); // Word one word two Word three = 6 words
    expect(stats.approximate).toBe(true);
  });

  it("handles documents without explicit begin document", () => {
    const rawProse = "Plain text without any LaTeX tags.";
    const stats = countLatexWords(rawProse);
    expect(stats.words).toBe(6);
  });
});
