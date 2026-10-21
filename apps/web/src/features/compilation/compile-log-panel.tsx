import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompilationView } from "@latex-collab/contracts";

export type DiagnosticSeverity = "error" | "warning";
type PanelTab = DiagnosticSeverity | "log";

export interface DiagnosticTarget {
  filePath?: string | undefined;
  line?: number | undefined;
  message: string;
}

export interface CompileLogPanelProps {
  projectId: string;
  job: CompilationView | null;
  apiUrl: string;
  onJumpToDiagnostic: (target: DiagnosticTarget) => void;
  onClose: () => void;
}

function baseName(path: string | undefined): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function matches(diagnostic: { message: string; filePath?: string | undefined }, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    diagnostic.message.toLowerCase().includes(needle) ||
    (diagnostic.filePath ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Bottom console listing LaTeX errors, warnings and the raw compiler log.
 * Every diagnostic can jump back into the editor at its source line.
 */
export function CompileLogPanel({
  projectId,
  job,
  apiUrl,
  onJumpToDiagnostic,
  onClose,
}: CompileLogPanelProps) {
  const diagnostics = job?.diagnostics ?? [];
  const errors = useMemo(
    () => diagnostics.filter((item) => item.severity === "error"),
    [diagnostics],
  );
  const warnings = useMemo(
    () => diagnostics.filter((item) => item.severity === "warning"),
    [diagnostics],
  );
  const [tab, setTab] = useState<PanelTab>(errors.length > 0 ? "error" : "warning");
  const [query, setQuery] = useState("");
  const [logText, setLogText] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    setTab(errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "error");
  }, [job?.id, errors.length, warnings.length]);

  useEffect(() => {
    setLogText(null);
    setLogError(null);
  }, [job?.id]);

  const loadLog = useCallback(async () => {
    if (!job) return;
    setLogLoading(true);
    setLogError(null);
    try {
      const response = await fetch(
        `${apiUrl}/projects/${projectId}/compilations/${job.id}/artifacts/compile.log`,
        { credentials: "include", headers: { accept: "text/plain" } },
      );
      if (!response.ok) {
        setLogError(
          response.status === 404
            ? "This compilation produced no log file."
            : `The log could not be loaded (HTTP ${response.status}).`,
        );
        setLogText(null);
        return;
      }
      setLogText(await response.text());
    } catch {
      setLogError("Network error while loading the compiler log.");
    } finally {
      setLogLoading(false);
    }
  }, [apiUrl, job, projectId]);

  useEffect(() => {
    if (tab === "log" && logText === null && !logLoading && !logError) void loadLog();
  }, [tab, logText, logLoading, logError, loadLog]);

  const filtered = useMemo(() => {
    if (!query) return diagnostics;
    return diagnostics.filter((item) => matches(item, query));
  }, [diagnostics, query]);

  const logLines = useMemo(() => {
    if (!logText) return [];
    const lines = logText.split("\n");
    if (!query) return lines;
    const needle = query.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [logText, query]);

  const list =
    tab === "error"
      ? filtered.filter((d) => d.severity === "error")
      : filtered.filter((d) => d.severity === "warning");

  return (
    <section
      className="compile-console"
      aria-label="Compilation console"
      data-testid="compile-console"
    >
      <header className="compile-console-header">
        <div className="compile-tabs" role="tablist" aria-label="Compilation output">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "error"}
            className={tab === "error" ? "active" : ""}
            onClick={() => setTab("error")}
            data-testid="tab-errors"
          >
            Errors <span className="compile-tab-count">{errors.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "warning"}
            className={tab === "warning" ? "active" : ""}
            onClick={() => setTab("warning")}
            data-testid="tab-warnings"
          >
            Warnings <span className="compile-tab-count">{warnings.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "log"}
            className={tab === "log" ? "active" : ""}
            onClick={() => setTab("log")}
            data-testid="tab-log"
          >
            Raw log
          </button>
        </div>
        <div className="compile-console-tools">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "log" ? "Search log…" : "Filter messages…"}
            aria-label={tab === "log" ? "Search compiler log" : "Filter diagnostics"}
          />
          <button type="button" onClick={onClose} aria-label="Close compilation console">
            ×
          </button>
        </div>
      </header>

      {tab !== "log" && (
        <div className="compile-console-body" role="tabpanel">
          {list.length === 0 ? (
            <p className="compile-console-empty" role="status">
              {query
                ? "No messages match this filter."
                : tab === "error"
                  ? "No errors. Your document compiled cleanly."
                  : "No warnings reported."}
            </p>
          ) : (
            <ul className="diagnostic-list">
              {list.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.message}-${index}`}
                  className={`diagnostic ${diagnostic.severity}`}
                >
                  <span className="diagnostic-icon" aria-hidden="true">
                    {diagnostic.severity === "error" ? "✕" : "!"}
                  </span>
                  <div className="diagnostic-text">
                    <p>{diagnostic.message}</p>
                    <p className="diagnostic-meta">
                      {baseName(diagnostic.filePath) || "main.tex"}
                      {diagnostic.line !== undefined ? ` · line ${diagnostic.line}` : ""}
                    </p>
                  </div>
                  {diagnostic.line !== undefined && (
                    <button
                      type="button"
                      className="diagnostic-jump"
                      onClick={() =>
                        onJumpToDiagnostic({
                          filePath: diagnostic.filePath,
                          line: diagnostic.line,
                          message: diagnostic.message,
                        })
                      }
                      aria-label={`Go to line ${diagnostic.line}`}
                    >
                      Go to line
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "log" && (
        <div className="compile-console-body" role="tabpanel">
          {logLoading && <p role="status">Loading compiler log…</p>}
          {logError && <p role="alert">{logError}</p>}
          {!logLoading && !logError && !job && (
            <p className="compile-console-empty" role="status">
              Compile the project to inspect the raw LaTeX log.
            </p>
          )}
          {!logLoading && !logError && logText !== null && (
            <>
              <p className="compile-console-meta">
                {logLines.length} line{logLines.length === 1 ? "" : "s"}
                {query ? " matched" : ""} · click “Raw log” search above to narrow the output.
              </p>
              <pre className="compile-log-text" tabIndex={0}>
                {logLines.join("\n")}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
