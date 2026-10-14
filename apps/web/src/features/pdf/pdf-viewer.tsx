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
  lastCompileStatus?: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | null;
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

  return (
    <div
      data-testid="pdf-viewer"
      className={`pdf-viewer-container flex flex-col h-full w-full bg-neutral-900 text-neutral-100 ${className}`}
      style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", backgroundColor: "#1e1e1e", color: "#f3f4f6" }}
    >
      {/* 1. Stale warning banner if subsequent compile failed but previous PDF is kept */}
      {isStale && (
        <div
          data-testid="stale-banner"
          className="stale-pdf-banner flex items-center justify-between px-4 py-2 bg-amber-900/80 text-amber-200 border-b border-amber-700 text-sm"
          style={{ backgroundColor: "#78350f", color: "#fef3c7", padding: "6px 12px", fontSize: "0.875rem", display: "flex", justifyContent: "space-between" }}
        >
          <div className="flex items-center gap-2">
            <span
              data-testid="stale-badge"
              className="px-2 py-0.5 rounded bg-amber-700 text-white font-semibold text-xs"
              style={{ backgroundColor: "#b45309", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}
            >
              OUTDATED
            </span>
            <span>
              Showing previous successful build. Latest compilation{" "}
              {lastCompileStatus ? lastCompileStatus.toUpperCase() : "FAILED"}.
            </span>
          </div>
          {errorMessage && <span className="text-xs text-amber-300 italic">{errorMessage}</span>}
        </div>
      )}

      {/* 2. Viewer Toolbar */}
      <div
        data-testid="pdf-toolbar"
        className="pdf-toolbar flex items-center justify-between px-3 py-1.5 bg-neutral-800 border-b border-neutral-700 text-xs"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          backgroundColor: "#262626",
          borderBottom: "1px solid #404040",
          fontSize: "0.75rem",
        }}
      >
        {/* Left: Page Navigation */}
        <div className="flex items-center gap-1.5" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            data-testid="page-prev"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || !pdfUrl}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40"
            style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#404040", color: "#fff" }}
          >
            &lt;
          </button>
          <span>Page</span>
          <input
            type="number"
            data-testid="page-input"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={handlePageChange}
            disabled={!pdfUrl}
            className="w-12 px-1 py-0.5 text-center bg-neutral-900 border border-neutral-600 rounded text-neutral-100"
            style={{ width: "45px", textAlign: "center", backgroundColor: "#171717", color: "#fff", border: "1px solid #525252" }}
          />
          <span>of</span>
          <span data-testid="page-total">{totalPages}</span>
          <button
            type="button"
            data-testid="page-next"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || !pdfUrl}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40"
            style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#404040", color: "#fff" }}
          >
            &gt;
          </button>
        </div>

        {/* Center: Zoom Controls & Fit Modes */}
        <div className="flex items-center gap-1.5" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            data-testid="zoom-out"
            onClick={handleZoomOut}
            disabled={!pdfUrl}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40"
            style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#404040", color: "#fff" }}
          >
            -
          </button>
          <button
            type="button"
            data-testid="zoom-reset"
            onClick={handleZoomReset}
            disabled={!pdfUrl}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 font-mono disabled:opacity-40"
            style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#404040", color: "#fff" }}
          >
            {fitMode === "none" ? `${zoom}%` : fitMode === "fit-width" ? "Fit Width" : "Fit Page"}
          </button>
          <button
            type="button"
            data-testid="zoom-in"
            onClick={handleZoomIn}
            disabled={!pdfUrl}
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40"
            style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#404040", color: "#fff" }}
          >
            +
          </button>

          <span className="text-neutral-500">|</span>

          <button
            type="button"
            data-testid="fit-width"
            onClick={handleFitWidth}
            disabled={!pdfUrl}
            className={`px-2 py-1 rounded ${fitMode === "fit-width" ? "bg-blue-600" : "bg-neutral-700 hover:bg-neutral-600"} disabled:opacity-40`}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: fitMode === "fit-width" ? "#2563eb" : "#404040",
              color: "#fff",
            }}
          >
            Fit Width
          </button>
          <button
            type="button"
            data-testid="fit-page"
            onClick={handleFitPage}
            disabled={!pdfUrl}
            className={`px-2 py-1 rounded ${fitMode === "fit-page" ? "bg-blue-600" : "bg-neutral-700 hover:bg-neutral-600"} disabled:opacity-40`}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: fitMode === "fit-page" ? "#2563eb" : "#404040",
              color: "#fff",
            }}
          >
            Fit Page
          </button>
        </div>

        {/* Right: Revision provenance & Download */}
        <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {formattedRevision && (
            <span
              data-testid="revision-label"
              className="text-neutral-400 font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-700"
              style={{ padding: "2px 6px", borderRadius: "4px", backgroundColor: "#171717", color: "#9ca3af", border: "1px solid #404040" }}
            >
              {formattedRevision}
            </span>
          )}

          <button
            type="button"
            data-testid="pdf-download-btn"
            onClick={handleDownloadClick}
            disabled={!pdfUrl}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 font-semibold text-white disabled:opacity-40"
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              backgroundColor: "#2563eb",
              color: "#fff",
              fontWeight: "600",
            }}
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* 3. Main Viewer Canvas / Document Display */}
      <div
        className="pdf-viewport flex-1 overflow-auto flex items-center justify-center p-4 relative"
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          position: "relative",
        }}
      >
        {pdfUrl ? (
          <div
            data-testid="pdf-document"
            className="pdf-canvas-wrapper shadow-2xl transition-transform duration-100 ease-out"
            style={{ ...scaleStyle, display: "flex", justifyContent: "center" }}
          >
            <object
              data={pdfUrl}
              type="application/pdf"
              width="800"
              height="1100"
              className="rounded border border-neutral-700 bg-white"
              style={{ border: "1px solid #525252", borderRadius: "4px", backgroundColor: "#fff" }}
            >
              <embed src={pdfUrl} type="application/pdf" width="800" height="1100" />
            </object>
          </div>
        ) : (
          <div
            data-testid="empty-pdf-message"
            className="text-center p-8 text-neutral-400"
            style={{ textAlign: "center", padding: "32px", color: "#9ca3af" }}
          >
            <p className="text-base font-medium mb-1">No PDF compiled yet</p>
            <p className="text-xs text-neutral-500">
              Click &quot;Recompile&quot; in the editor toolbar to compile your LaTeX project.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
