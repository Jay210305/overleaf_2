// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BasicVisualNodesView } from "../../../apps/web/src/features/visual/basic-nodes.js";
import { parseVisualAst } from "../../../packages/latex/src/visual-ast.js";

describe("S11-T03 Regression EDT-13: Basic Visual Nodes Invariants", () => {
  it("EDT-13: Preserves headings and paragraphs without modifying raw source strings", () => {
    const raw = "\\subsection{Results}\nFindings are presented below with \\textbf{clarity}.";
    const doc = parseVisualAst(raw);

    render(createElement(BasicVisualNodesView, { nodes: doc.nodes, readOnly: true }));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Results");
    expect(screen.getByTestId("visual-paragraph").textContent).toContain("clarity");
    // Verify document raw content is untouched
    expect(doc.rawSource).toBe(raw);
  });

  it("EDT-13: Rendered lists maintain item markers and content isolation", () => {
    const raw = `\\begin{itemize}
  \\item Alpha
  \\item Beta
\\end{itemize}`;
    const doc = parseVisualAst(raw);

    render(createElement(BasicVisualNodesView, { nodes: doc.nodes, readOnly: true }));

    const items = screen.getAllByTestId("visual-list-item");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Alpha");
    expect(items[1]?.textContent).toContain("Beta");
  });
});
