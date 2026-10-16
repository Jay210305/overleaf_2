import { describe, expect, it } from "vitest";
import { completeAtCursor } from "../../../packages/editor/src/completion.js";

describe("EDT-06 Regression: Complete commands, environments, labels, and file paths", () => {
  it("provides environment completion", () => {
    const res = completeAtCursor("\\begin{tab", 10);
    expect(res.items.some((it) => it.insertText === "table")).toBe(true);
    expect(res.items.some((it) => it.insertText === "tabular")).toBe(true);
  });

  it("provides label completion", () => {
    const text = "\\label{eq:maxwell}\n\\ref{eq:max";
    const res = completeAtCursor(text, text.length);
    expect(res.items.some((it) => it.insertText === "eq:maxwell")).toBe(true);
  });

  it("provides citation completion", () => {
    const text = "\\cite{turing";
    const res = completeAtCursor(text, text.length, {
      availableCitations: ["turing1936", "shannon1948"],
    });
    expect(res.items.some((it) => it.insertText === "turing1936")).toBe(true);
    expect(res.items.some((it) => it.insertText === "shannon1948")).toBe(false);
  });

  it("provides input file and image file path completion", () => {
    const fileRes = completeAtCursor("\\input{ch", 9, {
      availableFiles: ["chapters/intro.tex", "chapters/conclusion.tex"],
    });
    expect(fileRes.items).toHaveLength(2);

    const imgRes = completeAtCursor("\\includegraphics{img", 20, {
      availableFiles: ["img/diagram.png", "img/flowchart.pdf"],
    });
    expect(imgRes.items).toHaveLength(2);
  });
});
