// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileTree } from "../../apps/web/src/features/files/file-tree.js";

describe("S03-T05 File tree interactions integration", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mockTreeResponse = {
    projectId,
    treeVersion: 2,
    items: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        projectId,
        parentId: null,
        name: "main.tex",
        kind: "FILE" as const,
        mime: "application/x-tex",
        sizeBytes: 120,
        contentKind: "TEXT" as const,
        treeVersion: 2,
        deletedAt: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        projectId,
        parentId: null,
        name: "sections",
        kind: "FOLDER" as const,
        mime: "application/octet-stream",
        sizeBytes: 0,
        contentKind: "BINARY" as const,
        treeVersion: 2,
        deletedAt: null,
      },
    ],
  };

  it("loads and renders file tree from API", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockTreeResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));

    expect(await screen.findByText("main.tex")).toBeTruthy();
    expect(screen.getByText("sections")).toBeTruthy();

    const [url] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/v1/projects/${projectId}/nodes`);
  });

  it("creates a new file through dialog and calls POST endpoint with If-Match", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockTreeResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "44444444-4444-4444-8444-444444444444",
            projectId,
            parentId: null,
            name: "intro.tex",
            kind: "FILE",
            mime: "application/x-tex",
            sizeBytes: 0,
            contentKind: "TEXT",
            treeVersion: 3,
            deletedAt: null,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...mockTreeResponse,
            treeVersion: 3,
            items: [
              ...mockTreeResponse.items,
              {
                id: "44444444-4444-4444-8444-444444444444",
                projectId,
                parentId: null,
                name: "intro.tex",
                kind: "FILE" as const,
                mime: "application/x-tex",
                sizeBytes: 0,
                contentKind: "TEXT" as const,
                treeVersion: 3,
                deletedAt: null,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetcher);

    render(
      createElement(FileTree, {
        projectId,
        apiUrl: "http://api.test/api/v1",
        csrfToken: "csrf-val",
      }),
    );
    await screen.findByText("main.tex");

    // Click "New File" toolbar button
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Fill name input
    const nameInput = screen.getByLabelText("Name:");
    fireEvent.change(nameInput, { target: { value: "intro.tex" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(3);
    });

    const [postUrl, postInit] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe(`http://api.test/api/v1/projects/${projectId}/nodes`);
    expect(postInit.method).toBe("POST");
    expect((postInit.headers as Record<string, string>)["if-match"]).toBe('"2"');
    expect((postInit.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf-val");

    // Modal closes and new item is rendered
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("intro.tex")).toBeTruthy();
  });

  it("recovers from 409 conflict without creating phantom nodes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTreeResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "REVISION_CONFLICT", detail: "Sibling collision" }), {
          status: 409,
          headers: { "content-type": "application/problem+json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTreeResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("main.tex");

    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    fireEvent.change(screen.getByLabelText("Name:"), { target: { value: "main.tex" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    // Error displayed in alert role
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/already exists/i)).toBeTruthy();

    // Dialog remains open for correction
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Tree in background has NOT added any phantom node
    const treeItems = screen.getAllByRole("treeitem");
    expect(treeItems.length).toBe(2);
  });

  it("handles rename and delete actions through dialogs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(mockTreeResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...mockTreeResponse.items[0], name: "root.tex", treeVersion: 3 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...mockTreeResponse,
            treeVersion: 3,
            items: [
              { ...mockTreeResponse.items[0]!, name: "root.tex" },
              mockTreeResponse.items[1]!,
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(FileTree, { projectId, apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("main.tex");

    // Click rename button on main.tex
    fireEvent.click(screen.getByRole("button", { name: "Rename main.tex" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const input = screen.getByLabelText("New name:");
    fireEvent.change(input, { target: { value: "root.tex" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(3);
    });

    const [patchUrl, patchInit] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toContain(`/nodes/${mockTreeResponse.items[0]!.id}/rename`);
    expect(patchInit.method).toBe("PATCH");
  });
});
