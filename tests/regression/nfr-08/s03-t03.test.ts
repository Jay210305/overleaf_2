// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectsDashboard } from "../../../apps/web/src/features/projects/dashboard.js";

describe("NFR-08 regression: Accessible project dashboard (S03-T03)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exposes semantic landmarks, accessible names and keyboard-focusable controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                ownerId: "22222222-2222-4222-8222-222222222222",
                title: "Accessible Project",
                description: "Test description",
                compiler: "pdflatex" as const,
                status: "active" as const,
                currentRevision: 1,
                createdAt: "2026-10-10T10:00:00.000Z",
                updatedAt: "2026-10-10T12:00:00.000Z",
              },
            ],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      ),
    );

    render(createElement(ProjectsDashboard, { apiUrl: "http://api.test/api/v1" }));

    // Region landmark
    const region = screen.getByRole("region", { name: "Projects dashboard" });
    expect(region).toBeTruthy();

    // Primary heading
    const heading = screen.getByRole("heading", { level: 1, name: "Projects" });
    expect(heading).toBeTruthy();

    // All form controls have associated labels
    const searchInput = screen.getByLabelText("Search projects");
    expect(searchInput).toBeTruthy();
    expect(searchInput.tabIndex).toBeGreaterThanOrEqual(0);

    const sortSelect = screen.getByLabelText("Sort by");
    expect(sortSelect).toBeTruthy();
    expect(sortSelect.tabIndex).toBeGreaterThanOrEqual(0);

    // Tab buttons have accessible roles and states
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(5);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");

    // Table has proper header scopes and accessible actions
    const table = await screen.findByRole("table", { name: "Projects list" });
    expect(table).toBeTruthy();

    const dupBtn = screen.getByRole("button", { name: "Duplicate Accessible Project" });
    expect(dupBtn).toBeTruthy();
    const delBtn = screen.getByRole("button", { name: "Delete Accessible Project" });
    expect(delBtn).toBeTruthy();
  });
});
