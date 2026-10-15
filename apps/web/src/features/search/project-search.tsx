import React, { useState } from "react";
import type { SearchMatch, SearchView, ReplaceResult } from "@latex-collab/contracts";

export interface ProjectSearchProps {
  projectId: string;
  currentRevision: number;
  onNavigateToMatch?: (fileId: string, line: number) => void;
  onReplaceComplete?: (newRevisionId: string, replacements: number) => void;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export const ProjectSearch: React.FC<ProjectSearchProps> = ({
  projectId,
  currentRevision,
  onNavigateToMatch,
  onReplaceComplete,
  fetchImpl = fetch,
  baseUrl = "/api/v1",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        regex: String(isRegex),
      });

      const response = await fetchImpl(
        `${baseUrl}/projects/${projectId}/search?${params.toString()}`,
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Search request failed");
      }

      const data = (await response.json()) as SearchView;
      setMatches(data.items);
      setStatusMessage(`Found ${data.items.length} match(es).`);
    } catch (err: unknown) {
      setError((err as Error).message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!searchQuery) return;

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetchImpl(`${baseUrl}/projects/${projectId}/search/replace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: currentRevision,
          query: searchQuery,
          replacement: replaceQuery,
          regex: isRegex,
        }),
      });

      if (response.status === 409) {
        throw new Error(
          "Stale replace conflict: the project has been modified concurrently. Please refresh search preview.",
        );
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Replace operation failed");
      }

      const result = (await response.json()) as ReplaceResult;
      setStatusMessage(`Successfully replaced ${result.replacements} occurrence(s).`);
      setMatches([]);
      onReplaceComplete?.(result.newRevisionId, result.replacements);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="project-search-container p-4 bg-white dark:bg-gray-900 border rounded-md shadow-sm"
      role="region"
      aria-label="Project Search and Replace"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Find and Replace Across Project
        </h3>
        <span className="text-xs text-gray-500 font-mono">Rev: {currentRevision}</span>
      </div>

      {error && (
        <div
          className="mb-3 p-2.5 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded text-red-800 dark:text-red-200 text-xs"
          role="alert"
        >
          {error}
        </div>
      )}

      {statusMessage && (
        <div
          className="mb-3 p-2.5 bg-green-50 dark:bg-green-950 border border-green-300 dark:border-green-800 rounded text-green-800 dark:text-green-200 text-xs"
          role="status"
        >
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSearch} className="space-y-3 mb-4">
        <div>
          <label htmlFor="search-input" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <div className="flex gap-2">
            <input
              id="search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in project..."
              className="flex-1 px-3 py-1.5 border rounded text-sm bg-transparent border-gray-300 dark:border-gray-700"
              aria-label="Search term"
            />
            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Searching..." : "Find"}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="replace-input" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Replace
          </label>
          <div className="flex gap-2">
            <input
              id="replace-input"
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 px-3 py-1.5 border rounded text-sm bg-transparent border-gray-300 dark:border-gray-700"
              aria-label="Replacement text"
            />
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={loading || matches.length === 0}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              Replace All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isRegex}
              onChange={(e) => setIsRegex(e.target.checked)}
              className="rounded"
            />
            <span>Regular Expression</span>
          </label>
        </div>
      </form>

      <div className="search-results-list max-h-72 overflow-y-auto space-y-2" role="feed" aria-label="Search Results">
        {matches.length === 0 && !loading && (
          <p className="text-sm text-gray-500 py-3 text-center">No matches to display.</p>
        )}

        {matches.map((match, idx) => (
          <div
            key={`${match.fileId}-${match.line}-${idx}`}
            onClick={() => onNavigateToMatch?.(match.fileId, match.line)}
            className="p-2.5 border rounded text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer"
            role="article"
            aria-label={`Match in ${match.path} line ${match.line}`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{match.path}</span>
              <span className="text-gray-500">Line {match.line}</span>
            </div>
            <pre className="font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap truncate">
              {match.text}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};
