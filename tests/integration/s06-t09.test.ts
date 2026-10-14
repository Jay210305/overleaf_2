// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CompileControls } from "../../apps/web/src/features/compilation/compile-controls.js";
import type { CompilationView } from "@latex-collab/contracts";

describe("S06-T09 Compile controls and status polling integration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const projectId = "00000000-0000-0000-0000-000000000001";

  it("renders compile controls with engine selector, clean cache toggle, and recompile button", () => {
    render(createElement(CompileControls, { projectId }));

    expect(screen.getByTestId("compile-controls")).toBeTruthy();
    expect(screen.getByTestId("engine-select")).toBeTruthy();
    expect(screen.getByTestId("force-clean-toggle")).toBeTruthy();
    expect(screen.getByTestId("compile-button")).toBeTruthy();
    expect(screen.getByText(/Recompile/i)).toBeTruthy();
  });

  it("triggers compilation, enters compiling state, polls status, and calls onCompileComplete on success", async () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();

    const enqueuedJob: CompilationView = {
      id: "job-123",
      projectId,
      sourceRevisionId: "rev-1",
      status: "queued",
      startedAt: null,
      finishedAt: null,
      pdfAvailable: false,
      diagnostics: [],
    };

    const succeededJob: CompilationView = {
      ...enqueuedJob,
      status: "succeeded",
      pdfAvailable: true,
      finishedAt: new Date().toISOString(),
    };

    let getCalls = 0;
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(init.headers).toHaveProperty("Idempotency-Key");
        return {
          ok: true,
          status: 202,
          json: async () => enqueuedJob,
        } as Response;
      }
      getCalls++;
      // First poll queued, second poll succeeded
      const current = getCalls === 1 ? enqueuedJob : succeededJob;
      return {
        ok: true,
        status: 200,
        json: async () => current,
      } as Response;
    });

    render(
      createElement(CompileControls, {
        projectId,
        fetchImpl: mockFetch as unknown as typeof fetch,
        onCompileStart: onStart,
        onCompileComplete: onComplete,
      }),
    );

    const compileBtn = screen.getByTestId("compile-button");
    fireEvent.click(compileBtn);

    // Enters compiling state
    expect(screen.getByTestId("compile-loading")).toBeTruthy();
    expect(compileBtn.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith("job-123");
      expect(onComplete).toHaveBeenCalledWith(succeededJob);
    });

    // Returned to idle state with success badge
    expect(screen.getByTestId("compile-status-badge").textContent).toBe("succeeded");
    expect(screen.queryByTestId("compile-loading")).toBeNull();
  });

  it("handles cancel button during active compilation", async () => {
    const onComplete = vi.fn();
    const activeJob: CompilationView = {
      id: "job-cancel-test",
      projectId,
      sourceRevisionId: "rev-1",
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      pdfAvailable: false,
      diagnostics: [],
    };

    const cancelledJob: CompilationView = {
      ...activeJob,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
    };

    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          json: async () => cancelledJob,
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => activeJob,
      } as Response;
    });

    render(
      createElement(CompileControls, {
        projectId,
        initialJob: activeJob,
        fetchImpl: mockFetch as unknown as typeof fetch,
        onCompileComplete: onComplete,
      }),
    );

    const cancelBtn = screen.getByTestId("cancel-compile-btn");
    expect(cancelBtn).toBeTruthy();

    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(cancelledJob);
    });

    expect(screen.getByTestId("compile-status-badge").textContent).toBe("cancelled");
  });

  it("handles 429 quota exceeded error gracefully and leaves UI safe", async () => {
    const onError = vi.fn();
    const mockFetch = vi.fn(async () => {
      return {
        ok: false,
        status: 429,
        json: async () => ({ message: "QUOTA_EXCEEDED" }),
      } as Response;
    });

    render(
      createElement(CompileControls, {
        projectId,
        fetchImpl: mockFetch as unknown as typeof fetch,
        onCompileError: onError,
      }),
    );

    fireEvent.click(screen.getByTestId("compile-button"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    expect(screen.getByTestId("compile-error-msg")).toBeTruthy();
    expect(screen.getByTestId("compile-error-msg").textContent).toContain("quota exceeded");
    expect(screen.queryByTestId("compile-loading")).toBeNull();
  });

  it("triggers compilation on Ctrl+Enter keyboard shortcut (EDT-04)", async () => {
    const onStart = vi.fn();
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            id: "job-shortcut",
            projectId,
            sourceRevisionId: "rev-1",
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
          id: "job-shortcut",
          projectId,
          sourceRevisionId: "rev-1",
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
        projectId,
        fetchImpl: mockFetch as unknown as typeof fetch,
        onCompileStart: onStart,
      }),
    );

    // Fire Ctrl+Enter
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith("job-shortcut");
    });
  });

  it("displays diagnostics summary when errors and warnings exist", () => {
    const jobWithDiags: CompilationView = {
      id: "job-diags",
      projectId,
      sourceRevisionId: "rev-1",
      status: "failed",
      startedAt: null,
      finishedAt: null,
      pdfAvailable: false,
      diagnostics: [
        { severity: "error", message: "Undefined command" },
        { severity: "error", message: "Missing $" },
        { severity: "warning", message: "Undefined reference" },
      ],
    };

    render(
      createElement(CompileControls, {
        projectId,
        initialJob: jobWithDiags,
      }),
    );

    expect(screen.getByTestId("compile-status-badge").textContent).toBe("failed");
    const diagsSummary = screen.getByTestId("diagnostics-count");
    expect(diagsSummary.textContent).toContain("2 err");
    expect(diagsSummary.textContent).toContain("1 warn");
  });
});
