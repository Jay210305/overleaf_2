import { describe, expect, it } from "vitest";
import { parseVisualAst, serializeVisualAst, computeTextHash, type HeadingNode, type TableNode } from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "../../packages/editor/src/visual-patch.js";
import { applyTableCellPatch } from "../../packages/editor/src/visual-academic-patch.js";
import * as Y from "yjs";

/**
 * 100 Diverse, Non-Destructive LaTeX Fixtures
 */
export const ROUND_TRIP_FIXTURES: string[] = [
  // 1-5: Minimal & Empty Documents
  "",
  "   ",
  "\n\n\n",
  "% Just a comment line\n",
  "A single lonely sentence with no markup.",

  // 6-15: Section & Hierarchy
  "\\section{Introduction}\nContent of introduction.",
  "\\section*{Unnumbered Section}\nText under unnumbered.",
  "\\subsection{Background}\nSubsection content.\n\n\\subsubsection{Details}\nDeep details.",
  "\\section{Title with \\textbf{Bold}}\nText here.",
  "\\section{First}\nOne.\n\\section{Second}\nTwo.\n\\section{Third}\nThree.",
  "\\chapter{Overview}\nChapter text.\n\\section{Part 1}\nSection text.",
  "\\section{Math $x+y$ in Header}\nParagraph following.",
  "\\subsection{Edge: Spacing}\n\n\nParagraph after triple newline.",
  "\\section{Single Line}\n",
  "\\section{Trailing Text without Newline}",

  // 16-25: Inline Styling & Formatting
  "This is \\textbf{bold} text and \\textit{italic} text.",
  "Text with \\emph{emphasized} content and \\underline{underlined} content.",
  "Nested \\textbf{bold with \\textit{italic}} inside.",
  "Sentence with citation \\cite{einstein1905} and reference \\ref{sec:intro}.",
  "Multiple citations \\citep{smith2020, jones2021} in one sentence.",
  "Equation reference \\eqref{eq:maxwell} is widely used.",
  "Web links: \\url{https://ctan.org} and \\href{https://google.com}{Search Engine}.",
  "Special symbols \\% \\$ \\& \\_ \\{ \\} escaped correctly.",
  "Dashes: hyphen -, en-dash --, and em-dash --- in typography.",
  "Quotes: ``proper English LaTeX quotes'' and `single quotes'.",

  // 26-35: Itemize & Enumerate Lists
  "\\begin{itemize}\n  \\item First bullet\n  \\item Second bullet\n\\end{itemize}",
  "\\begin{enumerate}\n  \\item First step\n  \\item Second step\n  \\item Third step\n\\end{enumerate}",
  "\\begin{itemize}\n  \\item Bullet with \\textbf{bold text}\n  \\item Another bullet\n\\end{itemize}",
  "\\begin{enumerate}[label=(\\alph*)]\n  \\item Item a\n  \\item Item b\n\\end{enumerate}",
  "\\begin{itemize}\n  \\item Item with math $E=mc^2$\n  \\item Item with citation \\cite{ref1}\n\\end{itemize}",
  "\\begin{itemize}\n  \\item Multi-line\n    bullet paragraph\n  \\item Next\n\\end{itemize}",
  "\\begin{enumerate}\n  \\item Number one\n\\end{enumerate}\n\\begin{itemize}\n  \\item Bullet one\n\\end{itemize}",
  "\\begin{itemize}\n\\item Compact item\n\\item Second compact item\n\\end{itemize}",
  "\\begin{itemize}\n  \\item Lonely item\n\\end{itemize}",
  "\\begin{enumerate}\n  \\item Step with \\emph{emphasis}\n  \\item Final step\n\\end{enumerate}",

  // 36-50: Math Display & Inline Math
  "Inline math $f(x) = ax^2 + bx + c$ inside sentence.",
  "Multiple math chunks: $\\alpha$, $\\beta$, $\\gamma$, and $\\delta$.",
  "\\[\n  \\int_{0}^{1} x^2 dx = \\frac{1}{3}\n\\]",
  "$$\n  \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$",
  "\\begin{equation}\n  e^{i\\pi} + 1 = 0\n\\end{equation}",
  "\\begin{equation*}\n  \\mathcal{L}\\{f(t)\\} = F(s)\n\\end{equation*}",
  "\\[ \\mathbf{F} = m\\mathbf{a} \\]",
  "Text before\n\\[\n  A = \\pi r^2\n\\]\nText after.",
  "\\begin{equation}\n  \\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}\n\\end{equation}",
  "Math with matrix:\n\\[\n  \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\n\\]",
  "\\[ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\]",
  "$$ y = mx + b $$",
  "\\begin{equation}\n  \\lim_{x \\to 0} \\frac{\\sin x}{x} = 1\n\\end{equation}",
  "Inline with subscript $a_1, a_2, \\dots, a_n$ and superscript $x^2 + y^2$.",
  "Fraction math: $\\frac{\\partial f}{\\partial x} = 2x$.",

  // 51-60: Figures & Captions
  "\\begin{figure}\n  \\includegraphics{fig1.png}\n  \\caption{Sample plot}\n  \\label{fig:plot}\n\\end{figure}",
  "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{overview.pdf}\n  \\caption{Architecture diagram}\n  \\label{fig:arch}\n\\end{figure}",
  "\\begin{figure*}\n  \\includegraphics{wide.png}\n  \\caption{Wide figure}\n\\end{figure*}",
  "\\begin{figure}\n  \\includegraphics{photo.jpg}\n\\end{figure}",
  "\\begin{figure}\n  \\caption{Figure with caption before graphic}\n  \\includegraphics{image.png}\n\\end{figure}",
  "\\begin{figure}\n  \\includegraphics[scale=0.5]{data.png}\n  \\caption{Results from \\textbf{Experiment 1}}\n  \\label{fig:exp1}\n\\end{figure}",
  "\\begin{figure}\n  \\includegraphics{graph.eps}\n  \\caption{Vector plot}\n\\end{figure}",
  "\\begin{figure}\n  \\includegraphics{sub1.png}\n  \\includegraphics{sub2.png}\n  \\caption{Side by side}\n\\end{figure}",
  "\\begin{figure}\n  \\includegraphics{chart.svg}\n  \\caption{Clean chart}\n  \\label{fig:chart}\n\\end{figure}",
  "\\begin{figure}\n  \\centering\n  \\includegraphics{diagram.pdf}\n\\end{figure}",

  // 61-70: Tabular & Tables
  "\\begin{tabular}{|l|c|r|}\n  A & B & C \\\\\n  1 & 2 & 3 \\\\\n\\end{tabular}",
  "\\begin{table}\n  \\begin{tabular}{cc}\n    TopLeft & TopRight \\\\\n    BotLeft & BotRight \\\\\n  \\end{tabular}\n  \\caption{Small table}\n\\end{table}",
  "\\begin{tabular}{llr}\n  \\hline\n  Item & Qty & Price \\\\\n  \\hline\n  Apple & 5 & 2.50 \\\\\n  \\hline\n\\end{tabular}",
  "\\begin{tabular}{|p{3cm}|p{5cm}|}\n  Left Col & Right Col text \\\\\n\\end{tabular}",
  "\\begin{tabular}{|c|}\n  Single Cell \\\\\n\\end{tabular}",
  "\\begin{tabular}{ll}\n  Alpha & Beta \\\\\n  Gamma & Delta \\\\\n  Epsilon & Zeta \\\\\n\\end{tabular}",
  "\\begin{tabular}{|r|r|r|}\n  10 & 20 & 30 \\\\\n  40 & 50 & 60 \\\\\n\\end{tabular}",
  "\\begin{table}[h]\n  \\caption{Parameters}\n  \\begin{tabular}{|l|l|}\n    p1 & 0.01 \\\\\n  \\end{tabular}\n\\end{table}",
  "\\begin{tabular}{c}\n  Header \\\\\n  Row1 \\\\\n\\end{tabular}",
  "\\begin{tabular}{|c|c|}\n  \\textbf{Col 1} & \\textbf{Col 2} \\\\\n  Val 1 & Val 2 \\\\\n\\end{tabular}",

  // 71-80: TikZ & Vector Graphics
  "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}[scale=2]\n  \\draw[fill=blue!20] (0,0) rectangle (2,2);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\node[circle,draw] (A) {Node A};\n  \\node[circle,draw] (B) [right of=A] {Node B};\n  \\draw[->] (A) -- (B);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\draw[step=0.5cm,gray,very thin] (-1.4,-1.4) grid (1.4,1.4);\n  \\draw (-1.5,0) -- (1.5,0);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\shade[top color=yellow,bottom color=red] (0,0) rectangle +(2,1);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\draw (0,0) circle (1cm);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\draw plot[domain=0:3.14] (\\x,{sin(\\x r)});\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\path[fill=green] (0,0) -- (1,0) -- (0.5,0.866) -- cycle;\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\draw[thick,->] (0,0) -- (90:1cm);\n\\end{tikzpicture}",
  "\\begin{tikzpicture}\n  \\node {Root} child {node {Left}} child {node {Right}};\n\\end{tikzpicture}",

  // 81-90: Verbatim & Code Blocks
  "\\begin{verbatim}\nHello, World!\n\\end{verbatim}",
  "\\begin{verbatim}\ndef add(a, b):\n    return a + b\n\\end{verbatim}",
  "\\begin{verbatim}\n$ pnpm install\n$ pnpm test\n\\end{verbatim}",
  "\\begin{verbatim*}\nSpace visible verbatim\n\\end{verbatim*}",
  "\\begin{verbatim}\n#include <stdio.h>\nint main() { return 0; }\n\\end{verbatim}",
  "\\begin{verbatim}\nSELECT * FROM users WHERE active = true;\n\\end{verbatim}",
  "\\begin{verbatim}\n<html><body><h1>Title</h1></body></html>\n\\end{verbatim}",
  "\\begin{verbatim}\n{\n  \"key\": \"value\"\n}\n\\end{verbatim}",
  "\\begin{verbatim}\nLine with special characters: % $ & _ { } ~ ^ \\\n\\end{verbatim}",
  "\\begin{verbatim}\nEmpty follows\n\n\n\\end{verbatim}",

  // 91-100: Preambles, Macros & Edge Cases
  "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello.\n\\end{document}",
  "\\documentclass[12pt,a4paper]{report}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\nBody.\n\\end{document}",
  "\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\N}{\\mathbb{N}}",
  "\\def\\customCommand#1{[#1]}",
  "% Comment line with unicode: å, é, î, ø, ü, ñ, ç\nNormal text with UTF-8: Schrödinger's equation.",
  "\\documentclass{IEEEtran}\n\\title{Sample Paper}\n\\begin{document}\n\\maketitle\n\\section{Abstract}\nPaper content.\n\\end{document}",
  "Multiple blank lines:\n\n\n\nBetween paragraphs.",
  "\\begin{customEnv}\n  Unsupported custom environment.\n\\end{customEnv}",
  "\\section{Final Section}\nTrailing text with no final newline",
  "\\documentclass{beamer}\n\\usetheme{Madrid}\n\\begin{document}\n\\begin{frame}\n\\frametitle{Slide 1}\nSlide text.\n\\end{frame}\n\\end{document}",
];

describe("S11-T08 Round-Trip Fixtures: 100 Non-Destructive TeX Cases", () => {
  it("verifies exactly 100 diverse fixtures are defined", () => {
    expect(ROUND_TRIP_FIXTURES.length).toBe(100);
  });

  ROUND_TRIP_FIXTURES.forEach((fixture, index) => {
    it(`fixture #${index + 1}: preserves 100% byte fidelity and sha256 hash`, () => {
      const doc = parseVisualAst(fixture);
      const serialized = serializeVisualAst(doc);

      expect(serialized).toBe(fixture);
      expect(computeTextHash(serialized)).toBe(computeTextHash(fixture));
    });
  });

  it("modifies only target localized region when an edit is performed on a fixture", () => {
    // Take fixture #6 ("\\section{Introduction}\nContent of introduction.")
    const original = ROUND_TRIP_FIXTURES[5]!;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, original);

    const doc = parseVisualAst(original);
    const heading = doc.nodes.find((n) => n.kind === "heading") as HeadingNode;
    expect(heading).toBeDefined();

    // Patch heading title "Introduction" -> "Preliminary Remarks"
    const patch = createVisualPatch(
      "doc.tex",
      heading.titleRange.start,
      heading.titleRange.end,
      heading.title,
      "Preliminary Remarks",
      yDoc
    );

    const patchResult = applyVisualPatch(yText, patch);
    expect(patchResult.success).toBe(true);

    const updated = yText.toString();
    expect(updated).toBe("\\section{Preliminary Remarks}\nContent of introduction.");
    expect(updated.endsWith("\nContent of introduction.")).toBe(true);
  });

  it("modifies only table cell content without corrupting remaining table rows", () => {
    // Take fixture #61
    const original = ROUND_TRIP_FIXTURES[60]!;
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, original);

    const doc = parseVisualAst(original);
    const table = doc.nodes.find((n) => n.kind === "table") as TableNode;
    expect(table).toBeDefined();

    const res = applyTableCellPatch(yText, {
      fileId: "doc.tex",
      tableNode: table,
      rowIndex: 1,
      colIndex: 2,
      newContent: "999",
      expectedCellHash: table.rows[1]?.cells[2]?.hash ?? "",
      baseDoc: yDoc,
    });

    expect(res.success).toBe(true);
    expect(yText.toString()).toContain("1 & 2 & 999 \\\\");
    expect(yText.toString()).toContain("A & B & C \\\\");
  });
});
