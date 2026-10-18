import React, { useState } from "react";
import type { ConnectionStatus, Resource } from "@latex-collab/contracts";

export interface ZoteroLibraryPanelProps {
  projectId: string;
  userRole: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
  connected: boolean;
  libraries?: Resource[];
  linkedLibraryId?: string | null;
  onLinkLibrary?: (resourceId: string) => Promise<void>;
  onRefreshLibrary?: () => Promise<{ status: "synced" | "conflict"; detail?: string }>;
  onDisconnect?: () => Promise<void>;
}

export const ZoteroLibraryPanel: React.FC<ZoteroLibraryPanelProps> = ({
  projectId: _projectId,
  userRole,
  connected,
  libraries = [],
  linkedLibraryId = null,
  onLinkLibrary,
  onRefreshLibrary,
  onDisconnect,
}) => {
  const [selectedResource, setSelectedResource] = useState<string>(linkedLibraryId ?? "");
  const [status, setStatus] = useState<ConnectionStatus>(
    connected ? (linkedLibraryId ? "synced" : "connected") : "disconnected",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canEdit = userRole === "OWNER" || userRole === "EDITOR";

  const handleLink = async () => {
    if (!selectedResource || !onLinkLibrary || !canEdit) return;
    setLoading(true);
    setErrorMessage(null);
    setConflictWarning(null);
    try {
      setStatus("syncing");
      await onLinkLibrary(selectedResource);
      setStatus("synced");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to link Zotero library");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshLibrary || !canEdit) return;
    setLoading(true);
    setErrorMessage(null);
    setConflictWarning(null);
    try {
      setStatus("syncing");
      const result = await onRefreshLibrary();
      if (result.status === "conflict") {
        setStatus("conflict");
        setConflictWarning(
          result.detail ||
            "Remote library updated, but local .bib has manual edits. Review differences before overwriting.",
        );
      } else {
        setStatus("synced");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="zotero-library-panel p-4 bg-white dark:bg-gray-900 border rounded-md shadow-sm"
      role="region"
      aria-label="Zotero Integration"
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Zotero Linked Library
          </h3>
          <span
            className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-200"
            title="External linked bibliography is read-only in project"
          >
            Read-only Linked .bib
          </span>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded font-medium ${
            status === "synced"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : status === "conflict"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                : status === "error"
                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  : status === "connected"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {status.toUpperCase()}
        </span>
      </div>

      {!connected ? (
        <div className="text-sm text-gray-600 dark:text-gray-400 py-3">
          <p>Zotero account is not connected.</p>
          <p className="text-xs text-gray-500 mt-1">
            Connect your Zotero account in Account Settings to link reference libraries.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conflictWarning && (
            <div
              className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded text-amber-800 dark:text-amber-200 text-sm"
              role="alert"
            >
              <strong>Conflict Warning:</strong> {conflictWarning}
            </div>
          )}

          {errorMessage && (
            <div
              className="p-3 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200 text-sm"
              role="alert"
            >
              <strong>Error:</strong> {errorMessage}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label
              htmlFor="zotero-library-select"
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Select Zotero Library / Collection
            </label>
            <select
              id="zotero-library-select"
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
              disabled={!canEdit || loading}
              className="border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">-- Choose library --</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name} ({lib.kind})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleLink}
              disabled={!canEdit || !selectedResource || loading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-sm font-medium transition-colors"
            >
              {loading ? "Linking..." : "Link Library as .bib"}
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={!canEdit || !linkedLibraryId || loading}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded text-sm font-medium transition-colors"
            >
              {loading ? "Refreshing..." : "Refresh (.bib)"}
            </button>

            {onDisconnect && (
              <button
                type="button"
                onClick={onDisconnect}
                disabled={loading}
                className="px-3 py-1.5 border border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded text-sm ml-auto"
              >
                Disconnect
              </button>
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              Viewing only. Only project owners and editors can import or refresh linked libraries.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
