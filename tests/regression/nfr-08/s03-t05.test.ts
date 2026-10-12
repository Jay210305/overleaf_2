// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileTree } from "../../../apps/web/src/features/files/file-tree.js";

describe("NFR-08 regression: Accessible file tree interactions (S03-T05)", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mockTree = {
    projectId,
    treeVersion: 1,
    items: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        projectId,
        parentId: null,
        name: "main.tex",
        kind: "FILE" as const,
        mime: "application/x-tex",
        sizeBytes: 100,
        contentKind: "TEXT" as const,
        treeVersion: 1,
        deletedAt: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        projectId,
        parentId: null,
        name: "docs",
        kind: "FOLDER" as const,
        mime: "application/octet-stream",
        sizeBytes: 0,
        contentKind: "BINARY" as const,
        treeVersion: 1,
        deletedAt: null,
      },
    ],
  };

  it("exposes semantic landmarks, tree roles, and accessible labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockTree), { status: 200 }),
      ),
    );

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("main.tex");

    // Region landmark
    const region = screen.getByRole("region", { name: "File tree panel" });
    expect(region).toBeTruthy();

    // Toolbar for file operations
    const toolbar = screen.getByRole("toolbar", { name: "File tree toolbar" });
    expect(toolbar).toBeTruthy();

    // Tree role
    const tree = screen.getByRole("tree", { name: "Project files tree" });
    expect(tree).toBeTruthy();

    // Tree items have aria-level, aria-label, and aria-expanded where applicable
    const treeItems = screen.getAllByRole("treeitem");
    expect(treeItems.length).toBe(2);

    const folderItem = screen.getByLabelText("docs (folder)");
    expect(folderItem.getAttribute("aria-expanded")).toBe("false");
    expect(folderItem.getAttribute("aria-level")).toBe("1");

    const fileItem = screen.getByLabelText("main.tex (file)");
    expect(fileItem.getAttribute("aria-expanded")).toBeNull();
    expect(fileItem.getAttribute("aria-level")).toBe("1");
  });

  it("supports keyboard navigation with arrow keys and Enter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockTree), { status: 200 }),
      ),
    );

    const onSelect = vi.fn();
    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1", onSelectNode: onSelect }));
    await screen.findByText("main.tex");

    const tree = screen.getByRole("tree", { name: "Project files tree" });

    // ArrowDown to move focus
    fireEvent.keyDown(tree, { key: "ArrowDown" });

    // Enter to select / toggle
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("manages focus and accessible dialog attributes on modal interactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockTree), { status: 200 }),
      ),
    );

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("main.tex");

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));

    // Modal dialog attributes
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("dialog-title");

    // Input has associated label
    const nameInput = screen.getByLabelText("Name:");
    expect(nameInput).toBeTruthy();

    // Escape or Cancel closes modal
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
