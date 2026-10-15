import { describe, expect, it } from "vitest";
import {
  generateCiteSnippet,
  generateEquationSnippet,
  generateFigureSnippet,
  generateLinkSnippet,
  generateListSnippet,
  generateRefSnippet,
  generateSectionSnippet,
  generateTableSnippet,
  insertSnippet,
} from "../../../packages/editor/src/snippets.js";

describe("EDT-09 Regression: Guided academic snippets compile and preserve context", () => {
  it("provides valid LaTeX snippets for all declared elements", () => {
    expect(generateFigureSnippet()).toContain("\\begin{figure}");
    expect(generateTableSnippet()).toContain("\\begin{table}");
    expect(generateEquationSnippet()).toContain("\\begin{equation}");
    expect(generateSectionSnippet({ title: "Theory" })).toContain("\\section{Theory}");
    expect(generateListSnippet()).toContain("\\begin{itemize}");
    expect(generateLinkSnippet({ url: "https://ctan.org" })).toContain("\\url{https://ctan.org}");
    expect(generateRefSnippet("fig:1")).toBe("\\ref{fig:1}");
    expect(generateCiteSnippet("ref1")).toBe("\\cite{ref1}");
  });

  it("strictly replaces only the target region without corrupting document borders", () => {
    const doc = "Line 1\nLine 2\nLine 3";
    const inserted = insertSnippet(doc, 7, 13, "Line REPLACED");
    expect(inserted.newText).toBe("Line 1\nLine REPLACED\nLine 3");
  });
});
