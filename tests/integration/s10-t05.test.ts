import { describe, expect, it } from "vitest";
import {
  generateCiteSnippet,
  generateEquationSnippet,
  generateFigureSnippet,
  generateLabelSnippet,
  generateLinkSnippet,
  generateListSnippet,
  generateRefSnippet,
  generateSectionSnippet,
  generateTableSnippet,
  insertSnippet,
} from "../../packages/editor/src/snippets.js";

describe("S10-T05 Integration: Valid Academic Insertion Snippets", () => {
  it("generates valid figure snippet with caption and label", () => {
    const fig = generateFigureSnippet({
      imagePath: "plot.pdf",
      caption: "Experimental results",
      label: "results",
      width: "\\columnwidth",
    });
    expect(fig).toContain("\\begin{figure}[htbp]");
    expect(fig).toContain("\\includegraphics[width=\\columnwidth]{plot.pdf}");
    expect(fig).toContain("\\caption{Experimental results}");
    expect(fig).toContain("\\label{fig:results}");
    expect(fig).toContain("\\end{figure}");
  });

  it("generates valid table snippet with tabular structure", () => {
    const table = generateTableSnippet({
      caption: "Benchmark timings",
      label: "benchmarks",
      columns: 2,
      rows: 2,
    });
    expect(table).toContain("\\begin{table}[htbp]");
    expect(table).toContain("\\begin{tabular}{| c | c |}");
    expect(table).toContain("\\caption{Benchmark timings}");
    expect(table).toContain("\\label{tab:benchmarks}");
    expect(table).toContain("\\end{tabular}");
    expect(table).toContain("\\end{table}");
  });

  it("generates equation, section, list, and link snippets", () => {
    const eq = generateEquationSnippet({ math: "a^2 + b^2 = c^2", label: "pythagoras" });
    expect(eq).toContain("\\begin{equation}");
    expect(eq).toContain("\\label{eq:pythagoras}");
    expect(eq).toContain("a^2 + b^2 = c^2");
    expect(eq).toContain("\\end{equation}");

    const sec = generateSectionSnippet({ title: "Introduction", level: "section", label: "intro" });
    expect(sec).toBe("\\section{Introduction}\n\\label{sec:intro}");

    const list = generateListSnippet({ type: "itemize", items: ["Item A", "Item B"] });
    expect(list).toContain("\\begin{itemize}");
    expect(list).toContain("\\item Item A");
    expect(list).toContain("\\item Item B");
    expect(list).toContain("\\end{itemize}");

    const link = generateLinkSnippet({ url: "https://example.com", text: "Example Website" });
    expect(link).toBe("\\href{https://example.com}{Example Website}");
  });

  it("generates ref, cite, and label snippets and rejects invalid identifiers", () => {
    expect(generateRefSnippet("sec:intro")).toBe("\\ref{sec:intro}");
    expect(generateCiteSnippet("knuth1984")).toBe("\\cite{knuth1984}");
    expect(generateLabelSnippet("my_label")).toBe("\\label{my_label}");

    expect(() => generateRefSnippet("invalid label with spaces")).toThrow(/Invalid label/);
    expect(() => generateCiteSnippet("invalid key with spaces")).toThrow(/Invalid citation key/);
  });

  it("replaces only the selected range and leaves the surrounding text unchanged", () => {
    const initial = "Preamble.\n<<INSERT_HERE>>\nPostamble.";
    const from = initial.indexOf("<<INSERT_HERE>>");
    const to = from + "<<INSERT_HERE>>".length;
    const snippet = generateEquationSnippet({ math: "x = 1" });

    const result = insertSnippet(initial, from, to, snippet);

    expect(result.newText.startsWith("Preamble.\n")).toBe(true);
    expect(result.newText.endsWith("\nPostamble.")).toBe(true);
    expect(result.newText).toContain("\\begin{equation}");
    expect(result.newCursor).toBe(from + snippet.length);
  });

  it("rejects invalid replacement ranges", () => {
    expect(() => insertSnippet("hello", -1, 3, "foo")).toThrow(/Invalid selection range/);
    expect(() => insertSnippet("hello", 3, 2, "foo")).toThrow(/Invalid selection range/);
    expect(() => insertSnippet("hello", 0, 100, "foo")).toThrow(/Invalid selection range/);
  });
});
