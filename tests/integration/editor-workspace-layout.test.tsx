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

it("keeps compilation available when the PDF pane is hidden", async () => {
  await screen.findByRole("treeitem", { name: "main.tex (file)" });
  fireEvent.click(screen.getByRole("button", { name: "Hide PDF" }));
  expect(screen.queryByRole("complementary", { name: "PDF Preview and Compilation" })).toBeNull();
  expect(screen.getByTestId("compile-button").hasAttribute("disabled")).toBe(false);
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

it("preserves the selected document and comment draft while switching compact views", async () => {
  fireEvent.click(await screen.findByRole("treeitem", { name: "main.tex (file)" }));
  const source = await screen.findByTestId("source-code");
  expect(screen.getByRole("button", { name: "Start editing" })).toBeTruthy();
  const comments = screen.getByText("Comments", { selector: "summary" }).closest("details")!;
  expect(comments.open).toBe(false);
  comments.open = true;
  const draft = screen.getByLabelText("Comment body") as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: "Please expand this section." } });
  comments.open = false;
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  fireEvent.click(screen.getByRole("button", { name: "Editor" }));
  expect(screen.getByTestId("source-code")).toBe(source);
  comments.open = true;
  expect(draft.value).toBe("Please expand this section.");
});
