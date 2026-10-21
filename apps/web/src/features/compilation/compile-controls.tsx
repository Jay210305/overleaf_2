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
  /** Every compilable root candidate offered by the main-document selector. */
  texFiles?: Array<{ id: string; name: string }>;
  mainFileId?: string | null;
  onSelectMainFile?: (fileId: string) => void;
  /** Opens the errors/warnings/log console under the editor. */
  onOpenConsole?: () => void;
  consoleOpen?: boolean;
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
  texFiles = [],
  mainFileId = null,
  onSelectMainFile,
  onOpenConsole,
  consoleOpen = false,
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
      <details className="compile-options">
        <summary>
          {compiler === "pdflatex"
            ? "pdfLaTeX"
            : compiler === "xelatex"
              ? "XeLaTeX"
              : compiler === "lualatex"
                ? "LuaLaTeX"
                : "LaTeX"}{" "}
          options
        </summary>
        <div className="compile-options-panel">
          <label>
            Compiler engine
            <select
              data-testid="engine-select"
              aria-label="Compiler engine"
              value={compiler}
              onChange={(event) => setCompiler(event.target.value as Compiler)}
              disabled={isCompiling}
            >
              <option value="pdflatex">pdfLaTeX</option>
              <option value="xelatex">XeLaTeX</option>
              <option value="lualatex">LuaLaTeX</option>
              <option value="latex">LaTeX (DVI)</option>
            </select>
          </label>
          <label className="compile-clean-toggle">
            <input
              type="checkbox"
              data-testid="force-clean-toggle"
              checked={forceClean}
              onChange={(event) => setForceClean(event.target.checked)}
              disabled={isCompiling}
            />
            Clean Cache
          </label>
          {onSelectMainFile && texFiles.length > 0 && (
            <label className="compile-main-file">
              Main document
              <select
                data-testid="main-file-select"
                aria-label="Main document to compile"
                value={mainFileId ?? texFiles[0]?.id ?? ""}
                onChange={(event) => onSelectMainFile(event.target.value)}
                disabled={isCompiling}
              >
                {texFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </details>
      {activeJob && (
        <span
          data-testid="compile-status-badge"
          className="compile-status"
          data-status={activeJob.status}
          role="status"
        >
          {activeJob.status}
        </span>
      )}
      {(errorCount > 0 || warningCount > 0) && (
        <button
          type="button"
          data-testid="diagnostics-count"
          className="compile-diagnostics"
          onClick={onOpenConsole}
          aria-expanded={consoleOpen}
          aria-controls="compile-console-panel"
          title="Open the compilation console"
        >
          {errorCount > 0 && <span>❌ {errorCount} err</span>}
          {warningCount > 0 && <span>⚠️ {warningCount} warn</span>}
        </button>
      )}
      {errorMessage && (
        <span data-testid="compile-error-msg" className="compile-error" role="alert">
          {errorMessage}
        </span>
      )}
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
        title="Recompile (Ctrl+Enter or Ctrl+S)"
      >
        {isCompiling ? (
          <>
            <span data-testid="compile-loading" className="compile-spinner" aria-hidden="true" />
            <span>Compiling...</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">▷</span>
            <span>Recompile</span>
            <kbd>Ctrl ↵</kbd>
          </>
        )}
      </button>
    </div>
  );
}
