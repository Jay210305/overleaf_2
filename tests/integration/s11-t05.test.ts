// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  VisualMath,
  VisualFigure,
  VisualTable,
  AcademicVisualNodesView,
} from "../../apps/web/src/features/visual/academic-nodes.js";
import {
  parseVisualAst,
  type MathDisplayNode,
  type FigureNode,
  type TableNode,
} from "../../packages/latex/src/visual-ast.js";

afterEach(() => {
  cleanup();
});

describe("S11-T05 Integration: Render Supported Math Figures Tables and Cites", () => {
  it("renders display math with PDF authority indicator and supports formula editing", () => {
    const doc = parseVisualAst("\\[\n  \\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n\\]");
    const mathNode = doc.nodes.find((n) => n.kind === "mathDisplay") as MathDisplayNode;
    const onFormulaChange = vi.fn();

    render(
      createElement(VisualMath, {
        node: mathNode,
        readOnly: false,
        onFormulaChange,
      })
    );

    const mathContainer = screen.getByTestId("visual-math");
    expect(mathContainer.textContent).toContain("PDF is authority");
    expect(screen.getByTestId("math-preview").textContent).toContain("\\int_{0}^{\\infty}");

    // Click to edit
    fireEvent.click(screen.getByTestId("math-preview"));
    const textarea = screen.getByLabelText("Edit display formula") as HTMLTextAreaElement;
    expect(textarea.value).toBe(mathNode.formula);

    fireEvent.change(textarea, { target: { value: "x^2 + y^2 = r^2" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(onFormulaChange).toHaveBeenCalledWith(mathNode.id, "x^2 + y^2 = r^2", mathNode.hash);
  });

  it("renders figure environments and checks authorized assets and editable captions", () => {
    const doc = parseVisualAst(`\\begin{figure}
  \\includegraphics{figures/model.png}
  \\caption{Neural network diagram}
  \\label{fig:nn}
\\end{figure}`);
    const figureNode = doc.nodes.find((n) => n.kind === "figure") as FigureNode;
    const onCaptionChange = vi.fn();
    const onLabelChange = vi.fn();

    render(
      createElement(VisualFigure, {
        node: figureNode,
        authorizedImagePaths: ["figures/model.png"],
        readOnly: false,
        onCaptionChange,
        onLabelChange,
      })
    );

    expect(screen.getByTestId("figure-asset-status").textContent).toBe("Asset Authorized");
    expect(screen.getByTestId("figure-caption").textContent).toBe("Neural network diagram");
    expect(screen.getByTestId("figure-label").textContent).toBe("fig:nn");

    // Edit caption
    fireEvent.click(screen.getByTestId("figure-caption"));
    const captionInput = screen.getByTestId("figure-caption-input") as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: "Updated Diagram Caption" } });
    fireEvent.keyDown(captionInput, { key: "Enter" });

    expect(onCaptionChange).toHaveBeenCalledWith(figureNode.id, "Updated Diagram Caption", figureNode.hash);
  });

  it("renders tables and allows interactive cell editing", () => {
    const doc = parseVisualAst(`\\begin{tabular}{|c|r|}
  Header 1 & Header 2 \\\\
  Val A & Val B \\\\
\\end{tabular}`);
    const tableNode = doc.nodes.find((n) => n.kind === "table") as TableNode;
    const onCellChange = vi.fn();

    render(
      createElement(VisualTable, {
        node: tableNode,
        readOnly: false,
        onCellChange,
      })
    );

    const rows = screen.getAllByTestId("table-row");
    expect(rows.length).toBe(2);

    const cell00 = screen.getByTestId("table-cell-0-0");
    expect(cell00.textContent).toBe("Header 1");

    // Edit cell
    fireEvent.click(cell00.querySelector("span")!);
    const cellInput = screen.getByTestId("table-cell-input") as HTMLInputElement;
    fireEvent.change(cellInput, { target: { value: "Item Name" } });
    fireEvent.keyDown(cellInput, { key: "Enter" });

    expect(onCellChange).toHaveBeenCalledWith(
      tableNode.id,
      0,
      0,
      "Item Name",
      tableNode.rows[0]?.cells[0]?.hash
    );
  });

  it("enforces read-only protection on academic elements", () => {
    const doc = parseVisualAst(`\\[ E = mc^2 \\]
\\begin{figure}
  \\includegraphics{fig.png}
  \\caption{Title}
\\end{figure}`);

    render(
      createElement(AcademicVisualNodesView, {
        nodes: doc.nodes,
        readOnly: true,
      })
    );

    fireEvent.click(screen.getByTestId("math-preview"));
    expect(screen.queryByTestId("math-textarea")).toBeNull();

    fireEvent.click(screen.getByTestId("figure-caption"));
    expect(screen.queryByTestId("figure-caption-input")).toBeNull();
  });
});
