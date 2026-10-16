// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RestoreDialog } from "../../apps/web/src/features/history/restore-dialog.js";

describe("S09-T08: Explicit restore confirmation UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders modal dialog with affected files and triggers onConfirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose,
        onConfirm,
        targetRevisionNo: 3,
        currentRevisionNo: 5,
        affectedFiles: [
          { id: "f1", name: "main.tex", type: "modified" },
          { id: "f2", name: "old.tex", type: "deleted" },
        ],
        canRestore: true,
      }),
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Restore project" })).toBeDefined();
    expect(screen.getByText(/create a new revision v6/i)).toBeDefined();

    const fileList = screen.getByRole("list", { name: "Affected files" });
    expect(fileList).toBeDefined();
    expect(screen.getByText("main.tex")).toBeDefined();
    expect(screen.getByText("old.tex")).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: "Confirm Restore" });
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables confirm button and displays error when user lacks restore permissions", () => {
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        targetRevisionNo: 2,
        currentRevisionNo: 4,
        canRestore: false,
      }),
    );

    const confirmBtn = screen.getByRole("button", { name: "Confirm Restore" }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/do not have permission/i);
  });

  it("displays concurrency conflict error when provided", () => {
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        targetRevisionNo: 2,
        currentRevisionNo: 4,
        error: "Revision conflict: expected revision 4, but project is at revision 5.",
      }),
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Revision conflict/i);
  });
});
