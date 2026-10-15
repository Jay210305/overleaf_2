import { describe, expect, it } from "vitest";
import {
  parseVisualAst,
  serializeVisualAst,
  findNodeAtOffset,
  findNodeById,
  computeTextHash,
  type HeadingNode,
  type ParagraphNode,
  type ListNode,
  type MathDisplayNode,
  type FigureNode,
  type TableNode,
  type LiteralFallbackNode,
} from "../../packages/latex/src/visual-ast.js";

describe("S11-T02 Integration: Visual AST Projection and Range Map", () => {
  it("projects basic supported nodes (headings, paragraphs, lists) with exact source ranges", () => {
    const source = `\\section{Introduction}
This is a standard paragraph with \\textbf{bold} and \\emph{italic} text.

\\begin{itemize}
  \\item First bullet point
  \\item Second bullet point
\\end{itemize}`;

    const doc = parseVisualAst(source);
    expect(doc.hasErrors).toBe(false);
    expect(doc.nodes.length).toBeGreaterThanOrEqual(3);

    // Heading node
    const heading = doc.nodes[0] as HeadingNode;
    expect(heading.kind).toBe("heading");
    expect(heading.level).toBe("section");
    expect(heading.title).toBe("Introduction");
    expect(source.slice(heading.titleRange.start, heading.titleRange.end)).toBe("Introduction");
    expect(source.slice(heading.range.start, heading.range.end)).toBe(heading.raw);
    expect(heading.hash).toBe(computeTextHash(heading.raw));

    // Paragraph node
    const para = doc.nodes.find((n) => n.kind === "paragraph") as ParagraphNode;
    expect(para).toBeDefined();
    expect(para.spans.some((s) => s.kind === "bold" && s.content === "bold")).toBe(true);
    expect(para.spans.some((s) => s.kind === "italic" && s.content === "italic")).toBe(true);

    // List node
    const list = doc.nodes.find((n) => n.kind === "list") as ListNode;
    expect(list).toBeDefined();
    expect(list.listKind).toBe("itemize");
    expect(list.items.length).toBe(2);
    expect(list.items[0]?.content).toBe("First bullet point");
    expect(list.items[1]?.content).toBe("Second bullet point");

    // Non-destructive serialization
    expect(serializeVisualAst(doc)).toBe(source);
  });

  it("projects academic elements: display math, figures, tables, citations and references", () => {
    const source = `\\[
  E = mc^2
\\]

See equation~\\eqref{eq:einstein} and citation~\\cite{knuth1984}.

\\begin{figure}
  \\includegraphics{figures/diagram.png}
  \\caption{System architecture}
  \\label{fig:arch}
\\end{figure}

\\begin{tabular}{|c|l|}
  A & B \\\\
  1 & 2 \\\\
\\end{tabular}`;

    const doc = parseVisualAst(source);
    expect(doc.hasErrors).toBe(false);

    // Math display
    const math = doc.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    expect(math).toBeDefined();
    expect(math.displayKind).toBe("brackets");
    expect(math.formula).toBe("E = mc^2");

    // Paragraph with ref and cite
    const para = doc.nodes.find((n) => n.kind === "paragraph") as ParagraphNode;
    expect(para).toBeDefined();
    expect(para.spans.some((s) => s.kind === "reference" && s.key === "eq:einstein")).toBe(true);
    expect(para.spans.some((s) => s.kind === "citation" && s.keys.includes("knuth1984"))).toBe(true);

    // Figure
    const figure = doc.nodes.find((n) => n.kind === "figure") as FigureNode;
    expect(figure).toBeDefined();
    expect(figure.imagePath).toBe("figures/diagram.png");
    expect(figure.caption).toBe("System architecture");
    expect(figure.label).toBe("fig:arch");

    // Table
    const table = doc.nodes.find((n) => n.kind === "table") as TableNode;
    expect(table).toBeDefined();
    expect(table.alignment).toBe("|c|l|");
    expect(table.rows.length).toBe(2);
    expect(table.rows[0]?.cells[0]?.content).toBe("A");
    expect(table.rows[0]?.cells[1]?.content).toBe("B");

    // Byte-for-byte serialization
    expect(serializeVisualAst(doc)).toBe(source);
  });

  it("routes preamble, verbatim, TikZ, and unknown macros to literal fallback without alteration", () => {
    const source = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{tikz}

\\newcommand{\\foo}{bar}

\\begin{document}
\\begin{verbatim}
raw verbatim text % not a comment
\\end{verbatim}

\\begin{tikzpicture}
\\draw (0,0) -- (1,1);
\\end{tikzpicture}

\\customMacro{xyz}
\\end{document}`;

    const doc = parseVisualAst(source);
    const literalNodes = doc.nodes.filter((n) => n.kind === "literalFallback") as LiteralFallbackNode[];

    expect(literalNodes.length).toBeGreaterThanOrEqual(4);
    expect(literalNodes.some((n) => n.reason === "preamble")).toBe(true);
    expect(literalNodes.some((n) => n.reason === "verbatim")).toBe(true);
    expect(literalNodes.some((n) => n.reason === "tikz")).toBe(true);
    expect(literalNodes.some((n) => n.reason === "unknownMacro")).toBe(true);

    // Invariant: raw source of every literal node is exactly as in original input
    for (const node of literalNodes) {
      expect(source.slice(node.range.start, node.range.end)).toBe(node.raw);
      expect(node.hash).toBe(computeTextHash(node.raw));
    }

    // Byte-for-byte fidelity
    expect(serializeVisualAst(doc)).toBe(source);
  });

  it("provides bidirectional offset and id lookups through the range map", () => {
    const source = `\\section{First}
Hello world.

\\subsection{Second}
Another line.`;

    const doc = parseVisualAst(source);
    const heading1 = doc.nodes[0]!;

    // Find by offset inside heading
    const foundByOffset = findNodeAtOffset(doc, 5);
    expect(foundByOffset).not.toBeNull();
    expect(foundByOffset?.id).toBe(heading1.id);

    // Find by id
    const foundById = findNodeById(doc, heading1.id);
    expect(foundById).not.toBeNull();
    expect(foundById?.raw).toBe(heading1.raw);

    // Offset out of range
    expect(findNodeAtOffset(doc, 99999)).toBeNull();
    expect(findNodeById(doc, "non-existent")).toBeNull();
  });

  it("handles malformed/unclosed syntax gracefully without crashing or throwing", () => {
    const malformed = `\\section{Unclosed section
Just text without closing brace
\\begin{unknownenv}
broken content`;

    const doc = parseVisualAst(malformed);
    expect(doc).toBeDefined();
    expect(doc.nodes.length).toBeGreaterThan(0);
    // Non-destructive preservation even with malformed input
    expect(serializeVisualAst(doc)).toBe(malformed);
  });
});
