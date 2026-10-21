// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as Y from "yjs";
import { ProjectWorkspace } from "../../apps/web/src/features/projects/workspace.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, "\\section{Introduction}\nWrite here.");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.endsWith(`/projects/${projectId}`))
        return Response.json({ id: projectId, title: "Layout test", compiler: "pdflatex" });
      if (input.endsWith("/nodes"))
        return Response.json({
          treeVersion: 1,
          items: [
            {
              id: fileId,
              projectId,
              parentId: null,
              name: "main.tex",
              kind: "FILE",
              contentKind: "TEXT",
              mime: "application/x-tex",
              sizeBytes: 40,
            },
          ],
        });
      if (input.endsWith("/text"))
        return Response.json({
          fileId,
          updateBase64: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),
          stateVectorBase64: btoa(String.fromCharCode(...Y.encodeStateVector(doc))),
          persistedSeq: 1,
        });
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ProjectWorkspace, { projectId, apiUrl: "/api/v1" }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const dom = () => ({
  editor: document.querySelector(".workspace-editor") as HTMLElement,
  pdf: document.querySelector(".workspace-pdf-pane") as HTMLElement,
  splitter: document.querySelector(".workspace-splitter") as HTMLElement | null,
  sidebar: document.querySelector(".workspace-sidebar") as HTMLElement,
});

it("keeps compilation available when the PDF pane is hidden", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  fireEvent.click(screen.getByTestId("view-mode-editor"));
  expect(dom().pdf.hasAttribute("hidden")).toBe(true);
  expect(screen.getByTestId("compile-button").hasAttribute("disabled")).toBe(false);
});

it("switches between the three layout modes", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  const { editor, pdf } = dom();
  expect(editor.hasAttribute("hidden")).toBe(false);
  expect(pdf.hasAttribute("hidden")).toBe(false);
  expect(dom().splitter?.getAttribute("aria-orientation")).toBe("vertical");

  fireEvent.click(screen.getByTestId("view-mode-pdf"));
  expect(dom().editor.hasAttribute("hidden")).toBe(true);
  expect(dom().pdf.hasAttribute("hidden")).toBe(false);
  expect(dom().splitter).toBeNull();

  fireEvent.click(screen.getByTestId("view-mode-editor"));
  expect(dom().editor.hasAttribute("hidden")).toBe(false);
  expect(dom().pdf.hasAttribute("hidden")).toBe(true);

  fireEvent.click(screen.getByTestId("view-mode-split"));
  expect(dom().editor.hasAttribute("hidden")).toBe(false);
  expect(dom().pdf.hasAttribute("hidden")).toBe(false);
  expect(dom().splitter).not.toBeNull();
});

it("resizes the split view from the keyboard", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  const splitter = dom().splitter as HTMLElement;
  expect(splitter.getAttribute("aria-valuenow")).toBe("52");
  fireEvent.keyDown(splitter, { key: "ArrowLeft" });
  expect(dom().splitter?.getAttribute("aria-valuenow")).toBe("49");
});

it("collapses and restores the file sidebar from the header toggle", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  expect(dom().sidebar.hasAttribute("hidden")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));
  expect(dom().sidebar.hasAttribute("hidden")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
  expect(dom().sidebar.hasAttribute("hidden")).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Outline" }));
  expect(screen.getByText("No document open")).toBeTruthy();
});

it("shows the live outline of the open document and jumps to a section", async () => {
  fireEvent.click(await screen.findByRole("treeitem", { name: "main.tex (file)" }));
  await screen.findByTestId("source-code");
  fireEvent.click(screen.getByRole("tab", { name: "Outline" }));
  const heading = await screen.findByText("Introduction");
  fireEvent.click(heading);
  expect(screen.getByTestId("source-code")).toBeTruthy();
});

it("opens secondary tools and closes the tool list after selecting an action", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  const tools = screen.getByText("Tools").closest("details")!;
  expect(tools.open).toBe(false);
  fireEvent.click(screen.getByText("Tools"));
  tools.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByRole("dialog", { name: "Project Search" })).toBeTruthy();
  expect(tools.open).toBe(false);
});

it("preserves the selected document and comment draft while switching layout modes", async () => {
  fireEvent.click(await screen.findByRole("treeitem", { name: "main.tex (file)" }));
  const source = await screen.findByTestId("source-code");
  expect(screen.getByRole("button", { name: "Start editing" })).toBeTruthy();
  const comments = screen.getByText("Comments", { selector: "summary" }).closest("details")!;
  expect(comments.open).toBe(false);
  comments.open = true;
  const draft = screen.getByLabelText("Comment body") as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "Please expand this section." } });
  comments.open = false;
  fireEvent.click(screen.getByTestId("view-mode-pdf"));
  fireEvent.click(screen.getByTestId("view-mode-split"));
  expect(screen.getByTestId("source-code")).toBe(source);
  comments.open = true;
  expect(draft.value).toBe("Please expand this section.");
});
