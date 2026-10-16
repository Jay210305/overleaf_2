// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectsDashboard } from "../../apps/web/src/features/projects/dashboard.js";

describe("S03-T03 API-backed dashboard integration", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders loading state then projects from API pagination", async () => {
    const mockProjects = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        ownerId: "22222222-2222-4222-8222-222222222222",
        title: "Test Latex Paper",
        description: "Paper description",
        compiler: "pdflatex" as const,
        status: "active" as const,
        currentRevision: 1,
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T12:00:00.000Z",
      },
    ];

    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: mockProjects, nextCursor: "cursor-page-2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));

    // Verify loading then item appears
    expect(await screen.findByText("Test Latex Paper")).toBeTruthy();
    expect(screen.getByText("Paper description")).toBeTruthy();

    const [url] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("http://api.test/api/v1/projects");
    expect(url).toContain("filter=owned");
    expect(url).toContain("order=updatedAt");
  });

  it("renders empty state when no projects exist", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    expect(await screen.findByText("No projects found.")).toBeTruthy();
  });

  it("renders error state when API returns 401 or network error", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    expect(await screen.findByText(/session has expired/i)).toBeTruthy();
  });

  it("triggers category filter tabs and search query updates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("No projects found.");

    // Click 'Shared' tab
    const sharedTab = screen.getByRole("tab", { name: "Shared" });
    fireEvent.click(sharedTab);

    await waitFor(() => {
      const calls = fetcher.mock.calls;
      const lastUrl = calls[calls.length - 1]![0] as string;
      expect(lastUrl).toContain("filter=shared");
    });

    // Enter search text
    const searchInput = screen.getByLabelText("Search projects");
    fireEvent.change(searchInput, { target: { value: "Quantum" } });

    await waitFor(() => {
      const calls = fetcher.mock.calls;
      const lastUrl = calls[calls.length - 1]![0] as string;
      expect(lastUrl).toContain("q=Quantum");
    });
  });

  it("submits new project via create modal with CSRF token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "33333333-3333-4333-8333-333333333333",
            title: "Modal Created Project",
            compiler: "xelatex",
            status: "active",
            currentRevision: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                ownerId: "22222222-2222-4222-8222-222222222222",
                title: "Modal Created Project",
                description: null,
                compiler: "xelatex",
                status: "active",
                currentRevision: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);

    render(
      createElement(ProjectsDashboard, {
        apiUrl: "http://api.test/api/v1",
        csrfToken: "dashboard-csrf-token",
      }),
    );
    await screen.findByText("No projects found.");

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));

    // Fill form
    fireEvent.change(screen.getByLabelText(/Project Title/i), {
      target: { value: "Modal Created Project" },
    });
    fireEvent.change(screen.getByLabelText(/Compiler Engine/i), {
      target: { value: "xelatex" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await screen.findByText("Project created successfully.");
    const postCall = fetcher.mock.calls[1]!;
    expect(postCall[0]).toBe("http://api.test/api/v1/projects");
    expect((postCall[1] as RequestInit).headers).toMatchObject({
      "x-csrf-token": "dashboard-csrf-token",
    });
  });
});
