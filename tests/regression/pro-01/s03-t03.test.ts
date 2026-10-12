// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectsDashboard } from "../../../apps/web/src/features/projects/dashboard.js";

describe("PRO-01 regression: Paginated searchable owned/shared/recent dashboard (S03-T03)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("handles next and previous cursor pagination transitions", async () => {
    const page1Items = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        ownerId: "22222222-2222-4222-8222-222222222222",
        title: "Page 1 Item",
        description: null,
        compiler: "pdflatex" as const,
        status: "active" as const,
        currentRevision: 1,
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T12:00:00.000Z",
      },
    ];
    const page2Items = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        ownerId: "22222222-2222-4222-8222-222222222222",
        title: "Page 2 Item",
        description: null,
        compiler: "pdflatex" as const,
        status: "active" as const,
        currentRevision: 1,
        createdAt: "2026-10-10T09:00:00.000Z",
        updatedAt: "2026-10-10T11:00:00.000Z",
      },
    ];

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: page1Items, nextCursor: "cursor-to-page-2" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: page2Items, nextCursor: null }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: page1Items, nextCursor: "cursor-to-page-2" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));

    // Page 1
    expect(await screen.findByText("Page 1 Item")).toBeTruthy();
    const nextBtn = screen.getByRole("button", { name: "Next page" });
    const prevBtn = screen.getByRole("button", { name: "Previous page" });
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

    // Navigate to page 2
    fireEvent.click(nextBtn);
    expect(await screen.findByText("Page 2 Item")).toBeTruthy();

    await waitFor(() => {
      const calls = fetcher.mock.calls;
      const lastUrl = calls[calls.length - 1]![0] as string;
      expect(lastUrl).toContain("cursor=cursor-to-page-2");
    });

    // Navigate back to page 1
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("Page 1 Item")).toBeTruthy();
  });
});
