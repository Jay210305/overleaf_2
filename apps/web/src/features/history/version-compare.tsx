import { useEffect, useState, useMemo } from "react";
import { parsePublicConfig } from "@latex-collab/config";
import {
  myersDiff,
  compareRevisionManifests,
  type TreeRevisionDiff,
  type TextDiffResult,
  type ManifestItemDiff,
} from "./diff.js";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

interface RevisionItemApiResponse {
  nodeId: string;
  path: string;
  kind?: "TEXT" | "BINARY";
  sha256: string;
}

export interface VersionCompareProps {
  projectId: string;
  baseRevisionNo: number;
  targetRevisionNo: number;
  apiUrl?: string | undefined;
  onClose?: () => void;
  baseFileContent?: string;
  targetFileContent?: string;
}

export function VersionCompare({
  projectId,
  baseRevisionNo,
  targetRevisionNo,
  apiUrl = defaultApiUrl,
  onClose,
  baseFileContent = "",
  targetFileContent = "",
}: VersionCompareProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [treeDiff, setTreeDiff] = useState<TreeRevisionDiff | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    async function loadRevisions() {
      setLoading(true);
      setError(null);
      try {
        const [baseRes, targetRes] = await Promise.all([
          fetch(`${apiUrl}/projects/${projectId}/revisions/${baseRevisionNo}`, {
            credentials: "include",
          }),
          fetch(`${apiUrl}/projects/${projectId}/revisions/${targetRevisionNo}`, {
            credentials: "include",
          }),
        ]);

        if (!baseRes.ok || !targetRes.ok) {
          setError("Failed to fetch one of the revisions for comparison.");
          return;
        }

        const baseData = (await baseRes.json()) as { items?: RevisionItemApiResponse[] };
        const targetData = (await targetRes.json()) as { items?: RevisionItemApiResponse[] };

        const baseItems: ManifestItemDiff[] = (baseData.items || []).map((i) => ({
          nodeId: i.nodeId,
          path: i.path,
          kind: i.kind || (i.path.endsWith(".tex") ? "TEXT" : "BINARY"),
          sha256: i.sha256,
        }));

        const targetItems: ManifestItemDiff[] = (targetData.items || []).map((i) => ({
          nodeId: i.nodeId,
          path: i.path,
          kind: i.kind || (i.path.endsWith(".tex") ? "TEXT" : "BINARY"),
          sha256: i.sha256,
        }));

        const diff = compareRevisionManifests(baseItems, targetItems);
        setTreeDiff(diff);

        // Auto-select first modified or added file
        const firstModified =
          diff.modifiedText[0]?.path ||
          diff.renamed[0]?.newPath ||
          diff.added[0]?.path ||
          diff.modifiedBinary[0]?.path;
        if (firstModified) {
          setSelectedFile(firstModified);
        }
      } catch {
        setError("Error fetching revision diff.");
      } finally {
        setLoading(false);
      }
    }

    void loadRevisions();
  }, [apiUrl, projectId, baseRevisionNo, targetRevisionNo]);

  const textDiff: TextDiffResult | null = useMemo(() => {
    if (!selectedFile) return null;
    return myersDiff(baseFileContent, targetFileContent);
  }, [selectedFile, baseFileContent, targetFileContent]);

  return (
    <div
      className="version-compare bg-white dark:bg-gray-900 border rounded-lg shadow-lg overflow-hidden flex flex-col h-full"
      role="region"
      aria-label={`Comparing revision ${baseRevisionNo} with revision ${targetRevisionNo}`}
    >
      <header className="flex justify-between items-center px-4 py-3 border-b bg-gray-50 dark:bg-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Comparing v{baseRevisionNo} → v{targetRevisionNo}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing structural and content changes between selected revisions
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300"
            aria-label="Close comparison"
          >
            Close
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="p-3 m-4 text-sm text-red-700 bg-red-100 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500">Computing revision comparison...</div>
      ) : treeDiff ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Tree changes sidebar */}
          <aside
            className="w-1/3 border-r p-3 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50 text-sm"
            aria-label="Changed files list"
          >
            <h3 className="text-xs font-bold uppercase text-gray-400 mb-2">Changed Files</h3>

            {treeDiff.modifiedText.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-amber-600 block mb-1">
                  Modified Text ({treeDiff.modifiedText.length})
                </span>
                <ul className="space-y-1">
                  {treeDiff.modifiedText.map((m) => (
                    <li key={m.nodeId}>
                      <button
                        onClick={() => setSelectedFile(m.path)}
                        className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                          selectedFile === m.path
                            ? "bg-amber-100 dark:bg-amber-950/60 font-semibold text-amber-900"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        ~ {m.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {treeDiff.renamed.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-purple-600 block mb-1">
                  Renamed ({treeDiff.renamed.length})
                </span>
                <ul className="space-y-1">
                  {treeDiff.renamed.map((r) => (
                    <li key={r.nodeId}>
                      <button
                        onClick={() => setSelectedFile(r.newPath)}
                        className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                          selectedFile === r.newPath
                            ? "bg-purple-100 dark:bg-purple-950/60 font-semibold text-purple-900"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        ↪ {r.oldPath} → {r.newPath}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {treeDiff.added.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-emerald-600 block mb-1">
                  Added ({treeDiff.added.length})
                </span>
                <ul className="space-y-1">
                  {treeDiff.added.map((a) => (
                    <li key={a.nodeId}>
                      <button
                        onClick={() => setSelectedFile(a.path)}
                        className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                          selectedFile === a.path
                            ? "bg-emerald-100 dark:bg-emerald-950/60 font-semibold text-emerald-900"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        + {a.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {treeDiff.removed.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-red-600 block mb-1">
                  Removed ({treeDiff.removed.length})
                </span>
                <ul className="space-y-1">
                  {treeDiff.removed.map((rm) => (
                    <li key={rm.nodeId}>
                      <span className="block px-2 py-1 text-xs text-red-500 line-through truncate">
                        - {rm.path}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {treeDiff.modifiedBinary.length > 0 && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-blue-600 block mb-1">
                  Binary Changes ({treeDiff.modifiedBinary.length})
                </span>
                <ul className="space-y-1">
                  {treeDiff.modifiedBinary.map((b) => (
                    <li key={b.nodeId}>
                      <button
                        onClick={() => setSelectedFile(b.path)}
                        className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                          selectedFile === b.path
                            ? "bg-blue-100 dark:bg-blue-950/60 font-semibold text-blue-900"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        📦 {b.path} (hash changed)
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Diff viewer pane */}
          <main className="flex-1 p-4 overflow-y-auto" aria-label="Diff viewer">
            {selectedFile ? (
              <div>
                <div className="mb-3 flex justify-between items-center border-b pb-2">
                  <h3 className="font-mono text-sm font-bold text-gray-800 dark:text-gray-200">
                    {selectedFile}
                  </h3>
                  {textDiff && (
                    <div className="flex gap-2 text-xs font-mono">
                      <span className="text-emerald-600">+{textDiff.insertions}</span>
                      <span className="text-red-600">-{textDiff.deletions}</span>
                    </div>
                  )}
                </div>

                {treeDiff.modifiedBinary.some((b) => b.path === selectedFile) ? (
                  <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded text-center text-sm text-gray-600">
                    <p className="font-semibold mb-1">Binary file difference</p>
                    <p className="text-xs text-gray-500 font-mono">
                      SHA-256 hash changed between v{baseRevisionNo} and v{targetRevisionNo}.
                    </p>
                  </div>
                ) : textDiff && textDiff.lines.length > 0 ? (
                  <div className="font-mono text-xs border rounded overflow-hidden">
                    {textDiff.lines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex py-0.5 px-2 ${
                          line.type === "insert"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300"
                            : line.type === "delete"
                              ? "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-300"
                              : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span className="w-10 text-right pr-2 text-gray-400 select-none">
                          {line.oldLineNo ?? ""}
                        </span>
                        <span className="w-10 text-right pr-2 text-gray-400 select-none">
                          {line.newLineNo ?? ""}
                        </span>
                        <span className="w-4 select-none">
                          {line.type === "insert" ? "+" : line.type === "delete" ? "-" : " "}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap">{line.content}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No content diff available for this file.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-10">
                Select a file on the left to inspect its revision diff.
              </p>
            )}
          </main>
        </div>
      ) : null}
    </div>
  );
}
