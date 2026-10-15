// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  VisualHeading,
  VisualParagraph,
  VisualList,
  BasicVisualNodesView,
} from "../../apps/web/src/features/visual/basic-nodes.js";
import { parseVisualAst, type HeadingNode, type ParagraphNode, type ListNode } from "../../packages/latex/src/visual-ast.js";

afterEach(() => {
  cleanup();
});

describe("S11-T03 Integration: Render Basic Supported Visual Nodes", () => {
  it("renders headings with semantic HTML and handles inline title editing", () => {
    const doc = parseVisualAst("\\section{Project Overview}");
    const headingNode = doc.nodes[0] as HeadingNode;
    const onTitleChange = vi.fn();

    render(
      createElement(VisualHeading, {
        node: headingNode,
        readOnly: false,
        onTitleChange,
      })
    );

    // Assert semantic heading
    const headingEl = screen.getByRole("heading", { level: 1 });
    expect(headingEl.textContent).toBe("Project Overview");

    // Click to edit
    fireEvent.click(headingEl);
    const input = screen.getByLabelText("Edit section title") as HTMLInputElement;
    expect(input.value).toBe("Project Overview");

    // Change value and commit
    fireEvent.change(input, { target: { value: "Updated Overview" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onTitleChange).toHaveBeenCalledWith(headingNode.id, "Updated Overview", headingNode.hash);
  });

  it("renders paragraphs with bold, italic, and math spans correctly", () => {
    const doc = parseVisualAst("A paragraph with \\textbf{important} notes and \\emph{emphasis} plus $E=mc^2$.");
    const paraNode = doc.nodes.find((n) => n.kind === "paragraph") as ParagraphNode;
    const onTextChange = vi.fn();

    render(
      createElement(VisualParagraph, {
        node: paraNode,
        readOnly: false,
        onTextChange,
      })
    );

    const paraContainer = screen.getByTestId("visual-paragraph");
    expect(paraContainer.textContent).toContain("important");
    expect(paraContainer.textContent).toContain("emphasis");
    expect(paraContainer.textContent).toContain("$E=mc^2$");

    // Verify strong and em tags
    expect(paraContainer.querySelector("strong")?.textContent).toBe("important");
    expect(paraContainer.querySelector("em")?.textContent).toBe("emphasis");

    // Edit paragraph text
    fireEvent.click(paraContainer.querySelector("p")!);
    const textarea = screen.getByLabelText("Edit paragraph content") as HTMLTextAreaElement;
    expect(textarea.value).toBe(paraNode.text);

    fireEvent.change(textarea, { target: { value: "New paragraph content" } });
    fireEvent.blur(textarea);

    expect(onTextChange).toHaveBeenCalledWith(paraNode.id, "New paragraph content", paraNode.hash);
  });

  it("renders itemize and enumerate lists with interactive items", () => {
    const doc = parseVisualAst(`\\begin{enumerate}
  \\item First step
  \\item Second step
\\end{enumerate}`);
    const listNode = doc.nodes.find((n) => n.kind === "list") as ListNode;
    const onItemChange = vi.fn();

    render(
      createElement(VisualList, {
        node: listNode,
        readOnly: false,
        onItemChange,
      })
    );

    const listItems = screen.getAllByTestId("visual-list-item");
    expect(listItems.length).toBe(2);
    expect(listItems[0]?.textContent).toContain("First step");
    expect(listItems[1]?.textContent).toContain("Second step");

    // Edit item
    const firstItem = listItems[0];
    expect(firstItem).toBeDefined();
    const firstItemSpan = firstItem!.querySelector("span")!;
    fireEvent.click(firstItemSpan);
    const itemInput = screen.getByLabelText("Edit list item 1") as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: "First modified step" } });
    fireEvent.keyDown(itemInput, { key: "Enter" });

    expect(onItemChange).toHaveBeenCalledWith(listNode.id, 0, "First modified step", listNode.items[0]?.hash);
  });

  it("enforces read-only protection when readOnly is enabled", () => {
    const doc = parseVisualAst("\\section{Locked Section}\nLocked paragraph.");
    const heading = doc.nodes[0] as HeadingNode;
    const para = doc.nodes.find((n) => n.kind === "paragraph") as ParagraphNode;

    render(
      createElement(BasicVisualNodesView, {
        nodes: [heading, para],
        readOnly: true,
      })
    );

    const headingEl = screen.getByRole("heading", { level: 1 });
    fireEvent.click(headingEl);
    expect(screen.queryByTestId("heading-input")).toBeNull();

    const paraEl = screen.getByTestId("visual-paragraph").querySelector("p")!;
    fireEvent.click(paraEl);
    expect(screen.queryByTestId("paragraph-textarea")).toBeNull();
  });
});
