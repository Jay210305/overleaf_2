// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CompileControls } from "../../../apps/web/src/features/compilation/compile-controls.js";

describe("EDT-04 Editor compilation keyboard shortcut (S06-T09)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("handles Cmd+Enter (Mac) and Ctrl+Enter (Linux/Windows) to trigger compilation", async () => {
    let compileCount = 0;
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        compileCount++;
        return {
          ok: true,
          status: 202,
          json: async () => ({
            id: `job-key-${compileCount}`,
            projectId: "proj-edt",
            sourceRevisionId: "rev-edt",
            status: "succeeded",
            startedAt: null,
            finishedAt: null,
            pdfAvailable: true,
            diagnostics: [],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: `job-key-${compileCount}`,
          projectId: "proj-edt",
          sourceRevisionId: "rev-edt",
          status: "succeeded",
          startedAt: null,
          finishedAt: null,
          pdfAvailable: true,
          diagnostics: [],
        }),
      } as Response;
    });

    render(
      createElement(CompileControls, {
        projectId: "proj-edt",
        fetchImpl: mockFetch as unknown as typeof fetch,
      }),
    );

    // 1. Fire Cmd+Enter (metaKey)
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(compileCount).toBe(1);
    });

    // Wait until idle
    await waitFor(() => {
      expect(screen.queryByTestId("compile-loading")).toBeNull();
    });

    // 2. Fire Ctrl+Enter (ctrlKey)
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(compileCount).toBe(2);
    });
  });
});
