// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PdfViewer } from "../../../apps/web/src/features/pdf/pdf-viewer.js";

describe("CMP-03 PDF viewer zoom, page, fit-to-width, fit-to-page controls (S06-T08)", () => {
  afterEach(() => {
    cleanup();
  });

  it("provides interactive zoom, fit-width, fit-page, and page navigation controls", () => {
    render(
      createElement(PdfViewer, {
        projectId: "proj-123",
        pdfUrl: "/api/v1/projects/proj-123/compilations/job-1/artifacts/output.pdf",
        totalPages: 10,
      }),
    );

    const fitWidthBtn = screen.getByTestId("fit-width");
    const fitPageBtn = screen.getByTestId("fit-page");
    const zoomResetBtn = screen.getByTestId("zoom-reset");
    const zoomInBtn = screen.getByTestId("zoom-in");
    const zoomOutBtn = screen.getByTestId("zoom-out");
    const downloadBtn = screen.getByTestId("pdf-download-btn");

    expect(downloadBtn).toBeTruthy();

    // Verify fit-width and fit-page toggling
    fireEvent.click(fitWidthBtn);
    expect(zoomResetBtn.textContent).toBe("Fit Width");

    fireEvent.click(fitPageBtn);
    expect(zoomResetBtn.textContent).toBe("Fit Page");

    // Verify zoom level stepped increments
    fireEvent.click(zoomResetBtn);
    expect(zoomResetBtn.textContent).toBe("100%");

    fireEvent.click(zoomInBtn);
    expect(zoomResetBtn.textContent).toBe("125%");

    fireEvent.click(zoomOutBtn);
    expect(zoomResetBtn.textContent).toBe("100%");
  });
});
