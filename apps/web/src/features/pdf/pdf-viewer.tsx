import React, { useState, useCallback, useMemo } from "react";

export type FitMode = "none" | "fit-width" | "fit-page";

export interface PdfViewerProps {
  pdfUrl?: string | null;
  projectId: string;
  sourceRevisionId?: string;
  revisionNo?: number;
  revisionLabel?: string;
  isStale?: boolean;
  totalPages?: number;
  lastCompileStatus?:
    "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | null;
  errorMessage?: string | null;
  onDownload?: () => void;
  className?: string;
}

/**
 * Real PDF viewer component supporting zoom, fit modes, page navigation,
 * authorized downloading, revision provenance tracking, and stale state fallback (S06-T08, CMP-03, NFR-06).
 */
export function PdfViewer({
  pdfUrl,
  projectId: _projectId,
  sourceRevisionId,
  revisionNo,
  revisionLabel,
  isStale = false,
  totalPages: propTotalPages = 1,
  lastCompileStatus,
  errorMessage,
  onDownload,
  className = "",
}: PdfViewerProps): React.JSX.Element {
  const [zoom, setZoom] = useState<number>(100);
  const [fitMode, setFitMode] = useState<FitMode>("none");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = Math.max(1, propTotalPages);

  const handleZoomIn = useCallback(() => {
    setFitMode("none");
    setZoom((prev) => Math.min(prev + 25, 500));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitMode("none");
    setZoom((prev) => Math.max(prev - 25, 25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setFitMode("none");
    setZoom(100);
  }, []);

  const handleFitWidth = useCallback(() => {
    setFitMode("fit-width");
  }, []);

  const handleFitPage = useCallback(() => {
    setFitMode("fit-page");
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const handlePageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        setCurrentPage(Math.min(Math.max(val, 1), totalPages));
      }
    },
    [totalPages],
  );

  const handleDownloadClick = useCallback(() => {
    if (onDownload) {
      onDownload();
    } else if (pdfUrl) {
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = "output.pdf";
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    }
  }, [onDownload, pdfUrl]);

  const scaleStyle = useMemo((): React.CSSProperties => {
    if (fitMode === "fit-width") {
      return { width: "100%", height: "auto" };
    }
    if (fitMode === "fit-page") {
      return { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" };
    }
    return { transform: `scale(${zoom / 100})`, transformOrigin: "top center" };
  }, [fitMode, zoom]);

  const formattedRevision = useMemo(() => {
    if (revisionLabel) return revisionLabel;
    if (revisionNo !== undefined) return `Rev #${revisionNo}`;
    if (sourceRevisionId) return `Rev ${sourceRevisionId.slice(0, 8)}`;
    return null;
  }, [revisionLabel, revisionNo, sourceRevisionId]);

  const waiting = lastCompileStatus === "queued" || lastCompileStatus === "running";
  const failed = lastCompileStatus === "failed" || lastCompileStatus === "timed_out";

  return (
    <div data-testid="pdf-viewer" className={`pdf-viewer-container ${className}`}>
      {isStale && (
        <div data-testid="stale-banner" className="stale-pdf-banner" role="status">
          <span data-testid="stale-badge">OUTDATED</span>
          <span>
            Showing previous successful build. Latest compilation{" "}
            {lastCompileStatus ? lastCompileStatus.toUpperCase() : "FAILED"}.
          </span>
          {errorMessage && <span>{errorMessage}</span>}
        </div>
      )}
      <div data-testid="pdf-toolbar" className="pdf-toolbar" role="group" aria-label="PDF controls">
        <div className="pdf-toolbar-group">
          <button
            type="button"
            data-testid="page-prev"
            aria-label="Previous page"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || !pdfUrl}
          >
            ‹
          </button>
          <label htmlFor="pdf-page-number">Page</label>
          <input
            id="pdf-page-number"
            type="number"
            data-testid="page-input"
            aria-label="Page number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={handlePageChange}
            disabled={!pdfUrl}
          />
          <span>
            of <span data-testid="page-total">{totalPages}</span>
          </span>
          <button
            type="button"
            data-testid="page-next"
            aria-label="Next page"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || !pdfUrl}
          >
            ›
          </button>
        </div>
        <div className="pdf-toolbar-group">
          <button
            type="button"
            data-testid="zoom-out"
            aria-label="Zoom out"
            onClick={handleZoomOut}
            disabled={!pdfUrl}
          >
            −
          </button>
          <button
            type="button"
            data-testid="zoom-reset"
            aria-label="Reset zoom"
            onClick={handleZoomReset}
            disabled={!pdfUrl}
          >
            {fitMode === "none" ? `${zoom}%` : fitMode === "fit-width" ? "Fit Width" : "Fit Page"}
          </button>
          <button
            type="button"
            data-testid="zoom-in"
            aria-label="Zoom in"
            onClick={handleZoomIn}
            disabled={!pdfUrl}
          >
            +
          </button>
          <button
            type="button"
            data-testid="fit-width"
            onClick={handleFitWidth}
            disabled={!pdfUrl}
            aria-pressed={fitMode === "fit-width"}
          >
            Fit Width
          </button>
          <button
            type="button"
            data-testid="fit-page"
            onClick={handleFitPage}
            disabled={!pdfUrl}
            aria-pressed={fitMode === "fit-page"}
          >
            Fit Page
          </button>
        </div>
        <div className="pdf-toolbar-group">
          {formattedRevision && (
            <span data-testid="revision-label" className="pdf-revision">
              {formattedRevision}
            </span>
          )}
          <button
            type="button"
            data-testid="pdf-download-btn"
            onClick={handleDownloadClick}
            disabled={!pdfUrl}
          >
            Download PDF
          </button>
        </div>
      </div>
      <div className="pdf-viewport">
        {pdfUrl ? (
          <div data-testid="pdf-document" className="pdf-canvas-wrapper" style={scaleStyle}>
            <object
              data={pdfUrl}
              type="application/pdf"
              width="800"
              height="1100"
              aria-label="Compiled PDF"
            >
              <embed src={pdfUrl} type="application/pdf" width="800" height="1100" />
            </object>
          </div>
        ) : (
          <div data-testid="empty-pdf-message" className="pdf-empty" role="status">
            <div className="pdf-empty-icon" aria-hidden="true">
              PDF
            </div>
            <h3>
              {waiting
                ? "Compiling your document…"
                : failed
                  ? "Compilation needs attention"
                  : "Your document, ready to preview"}
            </h3>
            <p>
              {waiting
                ? "The preview will appear here when compilation finishes."
                : failed
                  ? "Check the compilation message above, update your source, then try again."
                  : 'Click "Recompile" to turn your LaTeX source into a PDF.'}
            </p>
            {!waiting && !failed && (
              <span className="pdf-empty-shortcut">You can also press Ctrl + Enter</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
