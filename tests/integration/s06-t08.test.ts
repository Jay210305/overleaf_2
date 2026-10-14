// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PdfViewer } from "../../apps/web/src/features/pdf/pdf-viewer.js";

describe("S06-T08 Real PDF viewer component integration", () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    projectId: "00000000-0000-0000-0000-000000000001",
    pdfUrl: "/api/v1/projects/00000000-0000-0000-0000-000000000001/compilations/job-1/artifacts/output.pdf",
    sourceRevisionId: "rev-uuid-1234-5678",
    revisionNo: 3,
    totalPages: 5,
  };

  it("renders empty state placeholder when no PDF is available", () => {
    render(
      createElement(PdfViewer, {
        projectId: defaultProps.projectId,
        pdfUrl: null,
      }),
    );

    expect(screen.getByTestId("pdf-viewer")).toBeTruthy();
    expect(screen.getByTestId("empty-pdf-message")).toBeTruthy();
    expect(screen.getByText("No PDF compiled yet")).toBeTruthy();

    // Controls are disabled when no PDF is loaded
    expect(screen.getByTestId("zoom-in").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("zoom-out").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("pdf-download-btn").hasAttribute("disabled")).toBe(true);
  });

  it("renders loaded PDF document and controls with revision provenance label", () => {
    render(createElement(PdfViewer, defaultProps));

    expect(screen.getByTestId("pdf-viewer")).toBeTruthy();
    expect(screen.getByTestId("pdf-document")).toBeTruthy();
    expect(screen.getByTestId("revision-label")).toBeTruthy();
    expect(screen.getByTestId("revision-label").textContent).toBe("Rev #3");
    expect(screen.getByTestId("page-total").textContent).toBe("5");
  });

  it("handles zoom controls (+25%, -25%, reset to 100%)", () => {
    render(createElement(PdfViewer, defaultProps));

    const zoomResetBtn = screen.getByTestId("zoom-reset");
    const zoomInBtn = screen.getByTestId("zoom-in");
    const zoomOutBtn = screen.getByTestId("zoom-out");

    expect(zoomResetBtn.textContent).toBe("100%");

    // Zoom in
    fireEvent.click(zoomInBtn);
    expect(zoomResetBtn.textContent).toBe("125%");

    fireEvent.click(zoomInBtn);
    expect(zoomResetBtn.textContent).toBe("150%");

    // Zoom out
    fireEvent.click(zoomOutBtn);
    expect(zoomResetBtn.textContent).toBe("125%");

    // Zoom reset
    fireEvent.click(zoomResetBtn);
    expect(zoomResetBtn.textContent).toBe("100%");
  });

  it("handles fit-to-width and fit-to-page modes", () => {
    render(createElement(PdfViewer, defaultProps));

    const fitWidthBtn = screen.getByTestId("fit-width");
    const fitPageBtn = screen.getByTestId("fit-page");
    const zoomResetBtn = screen.getByTestId("zoom-reset");

    // Click fit width
    fireEvent.click(fitWidthBtn);
    expect(zoomResetBtn.textContent).toBe("Fit Width");

    // Click fit page
    fireEvent.click(fitPageBtn);
    expect(zoomResetBtn.textContent).toBe("Fit Page");

    // Clicking zoom in exits fit mode back to percentage
    fireEvent.click(screen.getByTestId("zoom-in"));
    expect(zoomResetBtn.textContent).toBe("125%");
  });

  it("navigates pages (prev, next, manual page change) within bounds", () => {
    render(createElement(PdfViewer, defaultProps));

    const prevBtn = screen.getByTestId("page-prev");
    const nextBtn = screen.getByTestId("page-next");
    const pageInput = screen.getByTestId("page-input") as HTMLInputElement;

    expect(pageInput.value).toBe("1");
    expect(prevBtn.hasAttribute("disabled")).toBe(true);

    // Next page
    fireEvent.click(nextBtn);
    expect(pageInput.value).toBe("2");
    expect(prevBtn.hasAttribute("disabled")).toBe(false);

    // Direct input
    fireEvent.change(pageInput, { target: { value: "4" } });
    expect(pageInput.value).toBe("4");

    // Upper bound cap at totalPages (5)
    fireEvent.click(nextBtn);
    expect(pageInput.value).toBe("5");
    expect(nextBtn.hasAttribute("disabled")).toBe(true);
  });

  it("calls onDownload callback when download button is clicked", () => {
    const onDownloadMock = vi.fn();
    render(createElement(PdfViewer, { ...defaultProps, onDownload: onDownloadMock }));

    const downloadBtn = screen.getByTestId("pdf-download-btn");
    fireEvent.click(downloadBtn);

    expect(onDownloadMock).toHaveBeenCalledTimes(1);
  });

  it("displays prominent stale banner when subsequent compilation fails and retains previous PDF", () => {
    render(
      createElement(PdfViewer, {
        ...defaultProps,
        isStale: true,
        lastCompileStatus: "failed",
        errorMessage: "Undefined control sequence on line 14",
      }),
    );

    expect(screen.getByTestId("stale-banner")).toBeTruthy();
    expect(screen.getByTestId("stale-badge")).toBeTruthy();
    expect(screen.getByText("OUTDATED")).toBeTruthy();
    expect(screen.getByText(/Latest compilation FAILED/i)).toBeTruthy();
    expect(screen.getByText("Undefined control sequence on line 14")).toBeTruthy();

    // Previous PDF document remains visible
    expect(screen.getByTestId("pdf-document")).toBeTruthy();
  });
});
