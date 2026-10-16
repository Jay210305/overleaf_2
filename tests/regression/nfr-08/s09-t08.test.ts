// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RestoreDialog } from "../../../apps/web/src/features/history/restore-dialog.js";

describe("Regression NFR-08 (S09-T08): Restore dialog WCAG 2.2 AA accessibility and keyboard support", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides accessible ARIA attributes and closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose,
        onConfirm: vi.fn(),
        targetRevisionNo: 2,
        currentRevisionNo: 3,
        canRestore: true,
      }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("restore-dialog-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("restore-dialog-desc");

    // Press Escape to dismiss
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close on Escape if dialog is closed or currently restoring", () => {
    const onClose = vi.fn();
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose,
        onConfirm: vi.fn(),
        targetRevisionNo: 2,
        currentRevisionNo: 3,
        canRestore: true,
        isRestoring: true,
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
