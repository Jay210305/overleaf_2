// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademicVisualNodesView } from "../../../apps/web/src/features/visual/academic-nodes.js";
import { parseVisualAst } from "../../../packages/latex/src/visual-ast.js";

describe("S11-T05 Regression EDT-13: Academic Visual Nodes Invariants", () => {
  it("EDT-13: Math and figures render as non-destructive projections without altering source AST", () => {
    const raw = `\\[
  \\nabla \\cdot \\mathbf{B} = 0
\\]
\\begin{figure}
  \\includegraphics{figures/magnetic.png}
  \\caption{Magnetic field divergence}
  \\label{fig:mag}
\\end{figure}`;
    const doc = parseVisualAst(raw);

    render(
      createElement(AcademicVisualNodesView, {
        nodes: doc.nodes,
        authorizedImagePaths: ["figures/magnetic.png"],
        readOnly: true,
      }),
    );

    expect(screen.getByTestId("visual-math")).toBeDefined();
    expect(screen.getByTestId("figure-asset-status").textContent).toBe("Asset Authorized");
    expect(screen.getByTestId("figure-caption").textContent).toBe("Magnetic field divergence");
    expect(doc.rawSource).toBe(raw);
  });

  it("EDT-13: Table environments preserve structural row/cell integrity in visual projection", () => {
    const raw = `\\begin{tabular}{|l|c|r|}
  Left & Center & Right \\\\
  1 & 2 & 3 \\\\
\\end{tabular}`;
    const doc = parseVisualAst(raw);

    render(
      createElement(AcademicVisualNodesView, {
        nodes: doc.nodes,
        readOnly: true,
      }),
    );

    const rows = screen.getAllByTestId("table-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId("table-cell-0-0").textContent).toBe("Left");
    expect(screen.getByTestId("table-cell-1-2").textContent).toBe("3");
    expect(doc.rawSource).toBe(raw);
  });
});
