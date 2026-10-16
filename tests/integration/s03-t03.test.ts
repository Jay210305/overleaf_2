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

    const projectPage = () =>
      new Response(JSON.stringify({ items: mockProjects, nextCursor: "cursor-page-2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const emptyNotifications = () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    // The dashboard also mounts the notification region (S08-T06); route its
    // mount fetch to an empty page so project assertions keep their payload.
    const fetcher = vi.fn(async (url: string): Promise<Response> =>
      url.includes("/me/notifications") ? emptyNotifications() : projectPage(),
    );
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));

    // Verify loading then item appears
    expect(await screen.findByText("Test Latex Paper")).toBeTruthy();
    expect(screen.getByText("Paper description")).toBeTruthy();

    const projectUrl = fetcher.mock.calls
      .map((call) => call[0] as string)
      .find((candidate) => candidate.includes("/projects"));
    expect(projectUrl).toContain("http://api.test/api/v1/projects");
    expect(projectUrl).toContain("filter=owned");
    expect(projectUrl).toContain("order=updatedAt");
  });

  it("renders empty state when no projects exist", async () => {
    const empty = () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const fetcher = vi.fn(async (_url?: string): Promise<Response> => empty());
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    expect(await screen.findByText("No projects found.")).toBeTruthy();
  });

  it("renders error state when API returns 401 or network error", async () => {
    const fetcher = vi.fn(async (url: string): Promise<Response> => {
      if (url.includes("/me/notifications"))
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
      return new Response("Unauthorized", { status: 401 });
    });
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    expect(await screen.findByText(/session has expired/i)).toBeTruthy();
  });

  it("triggers category filter tabs and search query updates", async () => {
    const empty = () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    const fetcher = vi.fn(async (_url?: string): Promise<Response> => empty());
    vi.stubGlobal("fetch", fetcher);

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));
    await screen.findByText("No projects found.");

    // Click 'Shared' tab
    const sharedTab = screen.getByRole("tab", { name: "Shared" });
    fireEvent.click(sharedTab);

    await waitFor(() => {
      const projectUrls = fetcher.mock.calls
        .map((call) => call[0] as unknown as string)
        .filter((candidate) => candidate.includes("/projects"));
      expect(projectUrls[projectUrls.length - 1]).toContain("filter=shared");
    });

    // Enter search text
    const searchInput = screen.getByLabelText("Search projects");
    fireEvent.change(searchInput, { target: { value: "Quantum" } });

    await waitFor(() => {
      const projectUrls = fetcher.mock.calls
        .map((call) => call[0] as unknown as string)
        .filter((candidate) => candidate.includes("/projects"));
      expect(projectUrls[projectUrls.length - 1]).toContain("q=Quantum");
    });
  });

  it("submits new project via create modal with CSRF token", async () => {
    const emptyList = () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
    const created = () =>
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
      );
    const refreshedList = () =>
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
      );
    let projectReads = 0;
    const fetcher = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.includes("/me/notifications")) return emptyList();
      if (init?.method === "POST") return created();
      projectReads += 1;
      return projectReads === 1 ? emptyList() : refreshedList();
    });
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
    const postCall = fetcher.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    )!;
    expect(postCall[0]).toBe("http://api.test/api/v1/projects");
    expect((postCall[1] as RequestInit).headers).toMatchObject({
      "x-csrf-token": "dashboard-csrf-token",
    });
  });
});
