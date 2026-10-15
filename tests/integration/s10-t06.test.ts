import { describe, expect, it } from "vitest";
import {
  autoCloseEnvironment,
  completeAtCursor,
  extractLabels,
  getCompletionContext,
  getEnvironmentFoldRanges,
} from "../../packages/editor/src/completion.js";

describe("S10-T06 Integration: Complete environments, labels, and file paths", () => {
  it("auto-closes environments with proper indentation", () => {
    const closed = autoCloseEnvironment("equation");
    expect(closed).toBe("\\begin{equation}\n  \n\\end{equation}");

    const tableClosed = autoCloseEnvironment("tabular", "    ");
    expect(tableClosed).toBe("\\begin{tabular}\n    \n\\end{tabular}");

    expect(() => autoCloseEnvironment("invalid name")).toThrow(/Invalid environment name/);
  });

  it("extracts all label definitions from text", () => {
    const doc = `\\section{Intro}\\label{sec:intro}
Some text here with an equation:
\\begin{equation}\\label{eq:einstein}
E = mc^2
\\end{equation}
And a duplicate \\label{sec:intro}.`;

    const labels = extractLabels(doc);
    expect(labels).toEqual(["sec:intro", "eq:einstein"]);
  });

  it("identifies environment folding ranges accurately", () => {
    const doc = `\\documentclass{article}
\\begin{document}
  \\begin{figure}
    \\caption{Test}
  \\end{figure}
\\end{document}`;

    const ranges = getEnvironmentFoldRanges(doc);
    expect(ranges).toHaveLength(2);

    const figRange = ranges.find((r) => r.env === "figure");
    expect(figRange).toBeDefined();
    expect(doc.slice(figRange!.from, figRange!.to)).toContain("\\begin{figure}");
    expect(doc.slice(figRange!.from, figRange!.to)).toContain("\\end{figure}");

    const docRange = ranges.find((r) => r.env === "document");
    expect(docRange).toBeDefined();
    expect(doc.slice(docRange!.from, docRange!.to)).toContain("\\begin{document}");
    expect(doc.slice(docRange!.from, docRange!.to)).toContain("\\end{document}");
  });

  it("detects completion contexts correctly across commands, environments, labels, and files", () => {
    // Environment context
    const envDoc = "\\begin{equa";
    const envCtx = getCompletionContext(envDoc, envDoc.length);
    expect(envCtx.kind).toBe("environment");
    expect(envCtx.query).toBe("equa");

    // Label context
    const refDoc = "See section \\ref{sec:";
    const refCtx = getCompletionContext(refDoc, refDoc.length);
    expect(refCtx.kind).toBe("label");
    expect(refCtx.query).toBe("sec:");

    // Citation context
    const citeDoc = "As proven by \\cite{knu";
    const citeCtx = getCompletionContext(citeDoc, citeDoc.length);
    expect(citeCtx.kind).toBe("citation");
    expect(citeCtx.query).toBe("knu");

    // File context
    const fileDoc = "\\input{chapters/int";
    const fileCtx = getCompletionContext(fileDoc, fileDoc.length);
    expect(fileCtx.kind).toBe("file");
    expect(fileCtx.query).toBe("chapters/int");

    // Image context
    const imgDoc = "\\includegraphics[width=0.5\\textwidth]{images/plo";
    const imgCtx = getCompletionContext(imgDoc, imgDoc.length);
    expect(imgCtx.kind).toBe("image");
    expect(imgCtx.query).toBe("images/plo");

    // Command context
    const cmdDoc = "\\sect";
    const cmdCtx = getCompletionContext(cmdDoc, cmdDoc.length);
    expect(cmdCtx.kind).toBe("command");
    expect(cmdCtx.query).toBe("\\sect");
  });

  it("generates filtered completion suggestions matching the context query", () => {
    // Environment completion
    const envDoc = "\\begin{equ";
    const envRes = completeAtCursor(envDoc, envDoc.length);
    expect(envRes.items.some((it) => it.insertText === "equation")).toBe(true);

    // Label completion
    const labelDoc = "\\label{sec:first}\\label{sec:second}\nSee \\ref{sec:f";
    const labelRes = completeAtCursor(labelDoc, labelDoc.length);
    expect(labelRes.items.some((it) => it.insertText === "sec:first")).toBe(true);
    expect(labelRes.items.some((it) => it.insertText === "sec:second")).toBe(false);

    // File completion
    const fileDoc = "\\input{chap";
    const fileRes = completeAtCursor(fileDoc, fileDoc.length, {
      availableFiles: ["chapters/intro.tex", "chapters/methods.tex", "images/fig.png"],
    });
    expect(fileRes.items).toHaveLength(2);
    expect(fileRes.items[0]?.insertText).toBe("chapters/intro.tex");

    // Image completion
    const imgDoc = "\\includegraphics{fig";
    const imgRes = completeAtCursor(imgDoc, imgDoc.length, {
      availableFiles: ["fig1.png", "fig2.pdf", "main.tex"],
    });
    expect(imgRes.items).toHaveLength(2);
    expect(imgRes.items.some((it) => it.insertText === "main.tex")).toBe(false);
  });
});
