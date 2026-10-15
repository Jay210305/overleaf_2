import React, { useMemo, useState } from "react";
import {
  type BibEntrySummary,
  type DuplicateKeyReport,
  extractBibSummaries,
  findDuplicateBibKeys,
} from "@latex-collab/editor";

export interface ReferenceSearchProps {
  bibSource: string;
  onSelectKey?: (key: string) => void;
  onInsertCitation?: (key: string) => void;
}

export const ReferenceSearch: React.FC<ReferenceSearchProps> = ({
  bibSource,
  onSelectKey,
  onInsertCitation,
}) => {
  const [query, setQuery] = useState("");
  const [filterField, setFilterField] = useState<"all" | "key" | "title" | "author" | "year">("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Parse entries without altering bibSource (INT-08)
  const entries: BibEntrySummary[] = useMemo(() => {
    return extractBibSummaries(bibSource);
  }, [bibSource]);

  const duplicates: DuplicateKeyReport[] = useMemo(() => {
    return findDuplicateBibKeys(bibSource);
  }, [bibSource]);

  const duplicateKeySet = useMemo(() => {
    return new Set(duplicates.map((d) => d.key));
  }, [duplicates]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((entry) => {
      switch (filterField) {
        case "key":
          return entry.key.toLowerCase().includes(q);
        case "title":
          return Boolean(entry.title && entry.title.toLowerCase().includes(q));
        case "author":
          return Boolean(entry.author && entry.author.toLowerCase().includes(q));
        case "year":
          return Boolean(entry.year && entry.year.toLowerCase().includes(q));
        case "all":
        default:
          return (
            entry.key.toLowerCase().includes(q) ||
            Boolean(entry.title && entry.title.toLowerCase().includes(q)) ||
            Boolean(entry.author && entry.author.toLowerCase().includes(q)) ||
            Boolean(entry.year && entry.year.toLowerCase().includes(q))
          );
      }
    });
  }, [entries, query, filterField]);

  const handleCopy = (key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`\\cite{${key}}`).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div
      className="reference-search-panel p-4 bg-white dark:bg-gray-900 border rounded-md shadow-sm"
      role="region"
      aria-label="Reference Search"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Search References ({entries.length})
        </h3>
        <span
          className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded dark:bg-green-900 dark:text-green-200"
          title="Opening .bib never normalizes source"
        >
          Source Preserved
        </span>
      </div>

      {duplicates.length > 0 && (
        <div
          className="mb-3 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded text-amber-800 dark:text-amber-200 text-xs"
          role="alert"
        >
          <strong>Duplicate Citation Keys Detected:</strong>{" "}
          {duplicates.map((d) => `${d.key} (lines: ${d.lines.join(", ")})`).join("; ")}
        </div>
      )}

      <div className="flex gap-2 mb-4" role="search">
        <input
          type="search"
          aria-label="Search query"
          placeholder="Search by key, title, author, year..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-3 py-1.5 border rounded text-sm bg-transparent border-gray-300 dark:border-gray-700"
        />
        <select
          aria-label="Filter field"
          value={filterField}
          onChange={(e) => setFilterField(e.target.value as typeof filterField)}
          className="px-2 py-1.5 border rounded text-sm bg-transparent border-gray-300 dark:border-gray-700"
        >
          <option value="all">All Fields</option>
          <option value="key">Key</option>
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="year">Year</option>
        </select>
      </div>

      <div
        className="reference-list max-h-80 overflow-y-auto space-y-2"
        role="feed"
        aria-label="Matching references"
      >
        {filteredEntries.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No matching references found.</p>
        ) : (
          filteredEntries.map((entry) => {
            const isDuplicate = duplicateKeySet.has(entry.key);
            return (
              <div
                key={entry.key}
                className="p-3 border rounded text-sm bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex justify-between items-start"
              >
                <div className="flex-1 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      @{entry.key}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                      {entry.type}
                    </span>
                    {isDuplicate && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded dark:bg-red-900 dark:text-red-200">
                        Duplicate
                      </span>
                    )}
                  </div>
                  {entry.title && (
                    <p className="font-medium text-gray-900 dark:text-gray-100">{entry.title}</p>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {[entry.author, entry.year].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {onInsertCitation && (
                    <button
                      type="button"
                      onClick={() => onInsertCitation(entry.key)}
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                    >
                      Insert
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopy(entry.key);
                      onSelectKey?.(entry.key);
                    }}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {copiedKey === entry.key ? "Copied!" : "Copy \\cite"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
