// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PdfViewer } from "../../../apps/web/src/features/pdf/pdf-viewer.js";

describe("CMP-03 Retain previous valid PDF when compiler encounters error (S06-T10)", () => {
  afterEach(() => {
    cleanup();
  });

  it("retains previous genuine PDF viewable and downloadable after new build fails", () => {
    render(
      createElement(PdfViewer, {
        projectId: "proj-cmp03-retention",
        pdfUrl: "/api/v1/projects/proj-cmp03-retention/artifacts/output.pdf",
        isStale: true,
        lastCompileStatus: "failed",
        errorMessage: "LaTeX Error: File missing.sty not found.",
        totalPages: 3,
      }),
    );

    // Stale indicator is visible
    expect(screen.getByTestId("stale-banner")).toBeTruthy();
    expect(screen.getByTestId("stale-badge")).toBeTruthy();

    // The previous document and its download button are still available
    expect(screen.getByTestId("pdf-document")).toBeTruthy();
    expect(screen.getByTestId("pdf-download-btn")).toBeTruthy();
    expect(screen.getByTestId("pdf-download-btn").hasAttribute("disabled")).toBe(false);
  });
});
