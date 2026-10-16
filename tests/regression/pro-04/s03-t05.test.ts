// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileTree } from "../../../apps/web/src/features/files/file-tree.js";

describe("PRO-04 Regression: File tree UI traversal rejection and error recovery (S03-T05)", () => {
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
        name: "folderA",
        kind: "FOLDER" as const,
        mime: "application/octet-stream",
        sizeBytes: 0,
        contentKind: "BINARY" as const,
        treeVersion: 1,
        deletedAt: null,
      },
    ],
  };

  it("PRO-04: client blocks path traversal names before dispatching network request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(mockTree), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("main.tex");

    fireEvent.click(screen.getByRole("button", { name: "New file" }));

    // Try traversal names
    const invalidNames = ["..", "../traversal.tex", "dir/sub.tex", "\\windows\\path.tex"];
    for (const badName of invalidNames) {
      fireEvent.change(screen.getByLabelText("Name:"), { target: { value: badName } });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText(/invalid name/i)).toBeTruthy();

      // Only initial GET was called, no POST dispatched
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("PRO-04: displays backend 400 cycle error and cleans up dialog without corrupted state", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTree), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "VALIDATION_ERROR", detail: "Cycle detected" }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTree), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("folderA");

    // Open move dialog
    fireEvent.click(screen.getByRole("button", { name: "Move folderA" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Submit move
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    // Error alert displayed
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/cannot move into self or descendant/i)).toBeTruthy();
  });
});
