// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RestoreDialog } from "../../../apps/web/src/features/history/restore-dialog.js";

describe("Regression COL-11 (S09-T08): Restore confirmation UI preserves current ACL and clarifies scope", () => {
  afterEach(() => {
    cleanup();
  });

  it("clarifies that single-file restore preserves other files and collaborator permissions", () => {
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        targetRevisionNo: 1,
        currentRevisionNo: 2,
        targetFile: { id: "f123", name: "chapter1.tex" },
        canRestore: true,
      }),
    );

    expect(screen.getByRole("heading", { name: 'Restore file "chapter1.tex"' })).toBeDefined();
    expect(
      screen.getByText(/Other files and project permissions will remain unchanged/i),
    ).toBeDefined();
  });

  it("clarifies that project restore creates new revision preserving permissions", () => {
    render(
      createElement(RestoreDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        targetRevisionNo: 1,
        currentRevisionNo: 3,
        canRestore: true,
      }),
    );

    expect(
      screen.getByText(
        /Current collaborator permissions and project ownership will remain strictly unchanged/i,
      ),
    ).toBeDefined();
  });
});
