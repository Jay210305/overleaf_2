// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseVisualAst, type LiteralFallbackNode } from "@latex-collab/latex";
import {
  VisualLiteralFallback,
  FallbackNodesView,
} from "../../apps/web/src/features/visual/fallback-node.js";

afterEach(() => {
  cleanup();
});

describe("S11-T06 Integration: Literal Fallback for Unsupported TeX", () => {
  it("renders preamble and TikZ as non-destructive literal fallback blocks", () => {
    const raw = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\begin{tikzpicture}
  \\draw (0,0) -- (1,1);
\\end{tikzpicture}
\\end{document}`;
    const doc = parseVisualAst(raw);
    const fallbacks = doc.nodes.filter(
      (n) => n.kind === "literalFallback",
    ) as LiteralFallbackNode[];
    expect(fallbacks.length).toBeGreaterThanOrEqual(2);

    render(createElement(FallbackNodesView, { nodes: doc.nodes, readOnly: true }));

    const containers = screen.getAllByTestId("visual-literal-fallback");
    expect(containers.length).toBe(fallbacks.length);

    // Verify TikZ block has proper badge and raw preservation
    const tikzContainer = containers.find((c) => c.getAttribute("data-fallback-reason") === "tikz");
    expect(tikzContainer).toBeDefined();
    expect(tikzContainer?.textContent).toContain("TikZ Graphic (Vector Output in PDF)");
    expect(tikzContainer?.textContent).toContain("\\draw (0,0) -- (1,1);");
  });

  it("provides switch to code mode callback with exact source offset", () => {
    const raw = `\\begin{verbatim}
code block raw
\\end{verbatim}`;
    const doc = parseVisualAst(raw);
    const fallback = doc.nodes[0] as LiteralFallbackNode;
    const onSwitchToCode = vi.fn();

    render(
      createElement(VisualLiteralFallback, {
        node: fallback,
        readOnly: false,
        onSwitchToCodeMode: onSwitchToCode,
      }),
    );

    const switchBtn = screen.getByTestId("fallback-switch-code-btn");
    fireEvent.click(switchBtn);

    expect(onSwitchToCode).toHaveBeenCalledWith(fallback.range.start);
  });

  it("supports localized raw editing with hash concurrency guard", () => {
    const raw = `\\begin{verbatim}
line1
\\end{verbatim}`;
    const doc = parseVisualAst(raw);
    const fallback = doc.nodes[0] as LiteralFallbackNode;
    const onFallbackChange = vi.fn();

    render(
      createElement(VisualLiteralFallback, {
        node: fallback,
        readOnly: false,
        onFallbackChange,
      }),
    );

    fireEvent.click(screen.getByTestId("fallback-code-container"));
    const textarea = screen.getByTestId("fallback-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(fallback.raw);

    const updatedRaw = "\\begin{verbatim}\nline1-modified\n\\end{verbatim}";
    fireEvent.change(textarea, { target: { value: updatedRaw } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onFallbackChange).toHaveBeenCalledWith(fallback.id, updatedRaw, fallback.hash);
  });

  it("disables editing and hides edit prompts in readOnly mode", () => {
    const raw = `\\begin{verbatim}
frozen text
\\end{verbatim}`;
    const doc = parseVisualAst(raw);
    const fallback = doc.nodes[0] as LiteralFallbackNode;
    const onFallbackChange = vi.fn();

    render(
      createElement(VisualLiteralFallback, {
        node: fallback,
        readOnly: true,
        onFallbackChange,
      }),
    );

    fireEvent.click(screen.getByTestId("fallback-code-container"));
    expect(screen.queryByTestId("fallback-textarea")).toBeNull();
  });
});
