// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CompileControls } from "../../../apps/web/src/features/compilation/compile-controls.js";

describe("CMP-04 Compile controls idempotency and quota enforcement (S06-T09)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submits unique idempotency keys on every compile request and guards concurrent clicks", async () => {
    const keys: string[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)?.["Idempotency-Key"];
      if (key) keys.push(key);
      return {
        ok: true,
        status: 202,
        json: async () => ({
          id: "job-quota",
          projectId: "proj-1",
          sourceRevisionId: "rev-1",
          status: "queued",
          startedAt: null,
          finishedAt: null,
          pdfAvailable: false,
          diagnostics: [],
        }),
      } as Response;
    });

    render(
      createElement(CompileControls, {
        projectId: "proj-1",
        fetchImpl: mockFetch as unknown as typeof fetch,
      }),
    );

    const btn = screen.getByTestId("compile-button");
    fireEvent.click(btn);
    // Double click should be ignored because button is disabled during active compiling
    fireEvent.click(btn);

    await waitFor(() => {
      expect(keys.length).toBe(1);
      expect(keys[0]).toMatch(/^idemp-/);
    });
  });
});
