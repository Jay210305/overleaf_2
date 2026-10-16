import { useCallback, useEffect, useState } from "react";
import { parsePublicConfig } from "@latex-collab/config";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export interface RevisionSummary {
  id: string;
  revisionNo: number;
  manifestKey: string;
  manifestHash: string;
  authorId: string | null;
  authorName: string | null;
  source: string;
  label: string | null;
  createdAt: string;
}

export interface HistoryTimelineProps {
  projectId: string;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  canEdit?: boolean;
  onSelectRevision?: (revisionNo: number) => void;
  onCompareRevisions?: (baseNo: number, targetNo: number) => void;
}

export function HistoryTimeline({
  projectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  canEdit = true,
  onSelectRevision,
  onCompareRevisions,
}: HistoryTimelineProps) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState("");
  const [selectedRevisionNo, setSelectedRevisionNo] = useState<number | null>(null);
  const [editingLabelRevNo, setEditingLabelRevNo] = useState<number | null>(null);
  const [newLabelText, setNewLabelText] = useState("");
  const [compareBaseNo, setCompareBaseNo] = useState<number | null>(null);

  const fetchRevisions = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (cursor) params.set("cursor", cursor);
        if (labelFilter.trim()) params.set("label", labelFilter.trim());

        const res = await fetch(`${apiUrl}/projects/${projectId}/revisions?${params.toString()}`, {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "include",
        });

        if (!res.ok) {
          setError(`Failed to load history (${res.status})`);
          return;
        }

        const data = (await res.json()) as { items: RevisionSummary[]; nextCursor: string | null };
        if (append) {
          setRevisions((prev) => [...prev, ...data.items]);
        } else {
          setRevisions(data.items);
        }
        setNextCursor(data.nextCursor);
      } catch {
        setError("Network error loading revisions.");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, projectId, labelFilter],
  );

  useEffect(() => {
    void fetchRevisions(null, false);
  }, [fetchRevisions]);

  const handleSaveLabel = async (revisionNo: number) => {
    if (!csrfToken) return;
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/revisions/${revisionNo}/label`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ label: newLabelText.trim() || null }),
      });

      if (!res.ok) {
        setError("Failed to update label");
        return;
      }

      setRevisions((prev) =>
        prev.map((r) =>
          r.revisionNo === revisionNo ? { ...r, label: newLabelText.trim() || null } : r,
        ),
      );
      setEditingLabelRevNo(null);
    } catch {
      setError("Network error updating label");
    }
  };

  return (
    <div
      className="history-timeline p-4 bg-white dark:bg-gray-900 border rounded-md"
      aria-label="Project history timeline"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Project History</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Filter by label..."
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="px-2 py-1 text-sm border rounded"
            aria-label="Filter revisions by label"
          />
          <button
            onClick={() => void fetchRevisions(null, false)}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            aria-label="Search revisions"
          >
            Filter
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2 mb-3 text-sm text-red-700 bg-red-100 rounded">
          {error}
        </div>
      )}

      {loading && revisions.length === 0 ? (
        <p className="text-gray-500 text-sm">Loading revisions...</p>
      ) : revisions.length === 0 ? (
        <p className="text-gray-500 text-sm">No revisions found.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-800" role="list">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className={`py-3 px-2 flex flex-col gap-1 rounded cursor-pointer ${
                selectedRevisionNo === rev.revisionNo
                  ? "bg-blue-50 dark:bg-blue-950/40"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
              onClick={() => {
                setSelectedRevisionNo(rev.revisionNo);
                onSelectRevision?.(rev.revisionNo);
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                    v{rev.revisionNo}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {rev.source}
                  </span>
                  {rev.label && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-medium">
                      🏷️ {rev.label}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(rev.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>By {rev.authorName || rev.authorId || "System"}</span>

                <div className="flex gap-2">
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingLabelRevNo(rev.revisionNo);
                        setNewLabelText(rev.label || "");
                      }}
                      className="text-blue-600 hover:underline"
                      aria-label={`Edit label for revision ${rev.revisionNo}`}
                    >
                      {rev.label ? "Edit Label" : "Add Label"}
                    </button>
                  )}

                  {compareBaseNo === null ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompareBaseNo(rev.revisionNo);
                      }}
                      className="text-gray-600 hover:underline"
                      aria-label={`Select revision ${rev.revisionNo} for comparison`}
                    >
                      Compare
                    </button>
                  ) : compareBaseNo === rev.revisionNo ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompareBaseNo(null);
                      }}
                      className="text-red-500 hover:underline"
                    >
                      Cancel compare
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompareRevisions?.(compareBaseNo, rev.revisionNo);
                        setCompareBaseNo(null);
                      }}
                      className="text-emerald-600 font-medium hover:underline"
                      aria-label={`Compare revision ${compareBaseNo} with revision ${rev.revisionNo}`}
                    >
                      Diff with v{compareBaseNo}
                    </button>
                  )}
                </div>
              </div>

              {editingLabelRevNo === rev.revisionNo && (
                <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value)}
                    placeholder="Revision label (e.g. Submitted to Nature)"
                    className="flex-1 px-2 py-1 text-xs border rounded"
                    autoFocus
                  />
                  <button
                    onClick={() => void handleSaveLabel(rev.revisionNo)}
                    className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingLabelRevNo(null)}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={() => void fetchRevisions(nextCursor, true)}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
          >
            {loading ? "Loading more..." : "Load older revisions"}
          </button>
        </div>
      )}
    </div>
  );
}
