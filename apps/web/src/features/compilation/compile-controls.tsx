import React, { useState, useEffect, useCallback, useRef } from "react";
import type { Compiler, CompilationView } from "@latex-collab/contracts";

export interface CompileControlsProps {
  projectId: string;
  defaultCompiler?: Compiler;
  onCompileStart?: (jobId: string) => void;
  onCompileComplete?: (job: CompilationView) => void;
  onCompileError?: (err: Error) => void;
  initialJob?: CompilationView | null;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  className?: string;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `idemp-${crypto.randomUUID()}`;
  }
  return `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Interactive compile controls toolbar supporting manual/shortcut compilation,
 * engine selection, clean cache toggling, live polling, and cancellation (S06-T09, CMP-04, EDT-04).
 */
export function CompileControls({
  projectId,
  defaultCompiler = "pdflatex",
  onCompileStart,
  onCompileComplete,
  onCompileError,
  initialJob = null,
  apiBaseUrl = "/api/v1",
  fetchImpl = typeof fetch !== "undefined" ? fetch : undefined,
  className = "",
}: CompileControlsProps): React.JSX.Element {
  const [compiler, setCompiler] = useState<Compiler>(defaultCompiler);
  const [forceClean, setForceClean] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<CompilationView | null>(initialJob);
  const [isCompiling, setIsCompiling] = useState<boolean>(
    initialJob?.status === "queued" || initialJob?.status === "running",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeJobIdRef = useRef<string | null>(initialJob?.id ?? null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Poll job status until terminal result is reached
  const pollJobStatus = useCallback(
    async (jobId: string) => {
      if (!fetchImpl) return;
      try {
        const res = await fetchImpl(`${apiBaseUrl}/projects/${projectId}/compilations/${jobId}`);
        if (!res.ok) {
          throw new Error(`Failed to check compile status (HTTP ${res.status})`);
        }
        const data = (await res.json()) as CompilationView;
        setActiveJob(data);

        const isTerminal =
          data.status === "succeeded" ||
          data.status === "failed" ||
          data.status === "timed_out" ||
          data.status === "cancelled";

        if (isTerminal) {
          setIsCompiling(false);
          activeJobIdRef.current = null;
          onCompileComplete?.(data);
        } else {
          // Keep polling
          pollingTimeoutRef.current = setTimeout(() => {
            void pollJobStatus(jobId);
          }, 600);
        }
      } catch (err: unknown) {
        setIsCompiling(false);
        activeJobIdRef.current = null;
        const error = err instanceof Error ? err : new Error(String(err));
        setErrorMessage(error.message);
        onCompileError?.(error);
      }
    },
    [apiBaseUrl, fetchImpl, onCompileComplete, onCompileError, projectId],
  );

  const handleCompile = useCallback(async () => {
    if (isCompiling || !fetchImpl) return;

    setErrorMessage(null);
    setIsCompiling(true);
    stopPolling();

    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await fetchImpl(`${apiBaseUrl}/projects/${projectId}/compilations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          compiler,
          forceClean,
        }),
      });

      if (res.status === 429) {
        throw new Error("Compilation quota exceeded: an active job is already compiling.");
      }

      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          message?: string;
          detail?: string;
        } | null;
        throw new Error(
          errJson?.detail ?? errJson?.message ?? `Compilation request failed (${res.status})`,
        );
      }

      const enqueued = (await res.json()) as CompilationView;
      setActiveJob(enqueued);
      activeJobIdRef.current = enqueued.id;
      onCompileStart?.(enqueued.id);

      // Start polling
      void pollJobStatus(enqueued.id);
    } catch (err: unknown) {
      setIsCompiling(false);
      activeJobIdRef.current = null;
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMessage(error.message);
      onCompileError?.(error);
    }
  }, [
    apiBaseUrl,
    compiler,
    fetchImpl,
    forceClean,
    isCompiling,
    onCompileError,
    onCompileStart,
    pollJobStatus,
    projectId,
    stopPolling,
  ]);

  const handleCancel = useCallback(async () => {
    const currentId = activeJobIdRef.current;
    if (!currentId || !fetchImpl) return;

    try {
      const res = await fetchImpl(`${apiBaseUrl}/projects/${projectId}/compilations/${currentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const cancelled = (await res.json()) as CompilationView;
        setActiveJob(cancelled);
        setIsCompiling(false);
        stopPolling();
        activeJobIdRef.current = null;
        onCompileComplete?.(cancelled);
      }
    } catch {
      // Ignore background cancel errors
    }
  }, [apiBaseUrl, fetchImpl, onCompileComplete, projectId, stopPolling]);

  // Keyboard shortcut listener (EDT-04): Ctrl/Cmd+Enter or Ctrl/Cmd+S compiles.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key.toLowerCase() === "s")) {
        e.preventDefault();
        void handleCompile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCompile]);

  const errorCount = activeJob?.diagnostics?.filter((d) => d.severity === "error").length ?? 0;
  const warningCount = activeJob?.diagnostics?.filter((d) => d.severity === "warning").length ?? 0;

  return (
    <div data-testid="compile-controls" className={`compile-controls-bar ${className}`}>
      {/* Left: Engine Selector & Cache toggle */}
      <div className="compile-group compile-group-engine">
        <select
          data-testid="engine-select"
          aria-label="Compiler engine"
          value={compiler}
          onChange={(e) => setCompiler(e.target.value as Compiler)}
          disabled={isCompiling}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200"
          style={{
            backgroundColor: "#171717",
            border: "1px solid #404040",
            borderRadius: "4px",
            padding: "4px 8px",
            color: "#e5e5e5",
          }}
        >
          <option value="pdflatex">pdfLaTeX</option>
          <option value="xelatex">XeLaTeX</option>
          <option value="lualatex">LuaLaTeX</option>
          <option value="latex">LaTeX (DVI)</option>
        </select>

        <label className="compile-clean-toggle">
          <input
            type="checkbox"
            data-testid="force-clean-toggle"
            checked={forceClean}
            onChange={(e) => setForceClean(e.target.checked)}
            disabled={isCompiling}
            className="rounded bg-neutral-900 border-neutral-700"
          />
          <span>Clean Cache</span>
        </label>
      </div>

      {/* Center: Compile status & diagnostics summary */}
      <div className="compile-group compile-group-status">
        {activeJob && (
          <span
            data-testid="compile-status-badge"
            className="px-2 py-0.5 rounded font-mono text-xs uppercase"
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              fontFamily: "monospace",
              backgroundColor:
                activeJob.status === "succeeded"
                  ? "#15803d"
                  : activeJob.status === "failed"
                    ? "#b91c1c"
                    : activeJob.status === "timed_out"
                      ? "#b45309"
                      : activeJob.status === "cancelled"
                        ? "#525252"
                        : "#2563eb",
              color: "#ffffff",
            }}
          >
            {activeJob.status}
          </span>
        )}

        {(errorCount > 0 || warningCount > 0) && (
          <span
            data-testid="diagnostics-count"
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: "600" }}
          >
            {errorCount > 0 && <span style={{ color: "#f87171" }}>{errorCount} err</span>}
            {warningCount > 0 && <span style={{ color: "#fbbf24" }}>{warningCount} warn</span>}
          </span>
        )}

        {errorMessage && (
          <span
            data-testid="compile-error-msg"
            className="text-xs text-red-400 italic max-w-xs truncate"
            style={{
              color: "#f87171",
              fontStyle: "italic",
              maxWidth: "250px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {errorMessage}
          </span>
        )}
      </div>

      {/* Right: Compile Action Button & Cancel Button */}
      <div className="compile-group compile-group-actions">
        {isCompiling && (
          <button
            type="button"
            data-testid="cancel-compile-btn"
            onClick={handleCancel}
            className="compile-cancel-btn"
          >
            Cancel
          </button>
        )}

        <button
          type="button"
          data-testid="compile-button"
          onClick={handleCompile}
          disabled={isCompiling}
          className="compile-submit-btn"
        >
          {isCompiling ? (
            <>
              <span
                data-testid="compile-loading"
                className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full"
                style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  border: "2px solid #fff",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                }}
              />
              <span>Compiling...</span>
            </>
          ) : (
            <span>Recompile (Ctrl+S)</span>
          )}
        </button>
      </div>
    </div>
  );
}
