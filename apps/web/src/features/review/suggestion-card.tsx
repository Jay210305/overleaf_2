import React from "react";

export interface SuggestionCardProps {
  suggestion: {
    id: string;
    fileId: string;
    authorId: string;
    authorName: string | null;
    kind: "insert" | "delete" | "replace";
    oldTextHash: string;
    newText: string;
    status: "pending" | "accepted" | "rejected" | "conflict";
    resolvedBy?: string | null;
    createdAt: string;
  };
  canReview?: boolean;
  onResolve?: (suggestionId: string, decision: "accept" | "reject") => Promise<void>;
  isResolving?: boolean;
}

export function SuggestionCard({
  suggestion,
  canReview = false,
  onResolve,
  isResolving = false,
}: SuggestionCardProps) {
  const isPending = suggestion.status === "pending";
  const isConflict = suggestion.status === "conflict";

  const getStatusBadge = () => {
    switch (suggestion.status) {
      case "accepted":
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-medium">
            Accepted
          </span>
        );
      case "rejected":
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium">
            Rejected
          </span>
        );
      case "conflict":
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 font-medium">
            Conflict
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 font-medium">
            Pending Review
          </span>
        );
    }
  };

  const getKindLabel = () => {
    switch (suggestion.kind) {
      case "insert":
        return <span className="font-semibold text-emerald-600">Insert</span>;
      case "delete":
        return <span className="font-semibold text-red-600">Delete</span>;
      case "replace":
        return <span className="font-semibold text-blue-600">Replace</span>;
    }
  };

  return (
    <article
      className={`p-3 border rounded-md shadow-sm mb-3 bg-white dark:bg-gray-800 ${
        isConflict ? "border-red-300 dark:border-red-800" : "border-gray-200 dark:border-gray-700"
      }`}
      aria-labelledby={`suggestion-title-${suggestion.id}`}
    >
      <header className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-xs">
          {getKindLabel()}
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 dark:text-gray-300">
            By {suggestion.authorName || suggestion.authorId}
          </span>
          <span className="text-gray-400">•</span>
          <time className="text-gray-400" dateTime={suggestion.createdAt}>
            {new Date(suggestion.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        {getStatusBadge()}
      </header>

      <div className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-800 mb-2">
        {suggestion.kind === "delete" ? (
          <span className="text-red-600 dark:text-red-400 line-through">
            [Content proposed for deletion]
          </span>
        ) : (
          <span className="text-emerald-700 dark:text-emerald-300">{suggestion.newText}</span>
        )}
      </div>

      {isConflict && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2" role="alert">
          ⚠️ Context changed or file moved. Suggestion cannot be cleanly applied.
        </p>
      )}

      {isPending && canReview && onResolve && (
        <footer className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            disabled={isResolving}
            onClick={() => void onResolve(suggestion.id, "reject")}
            className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={isResolving}
            onClick={() => void onResolve(suggestion.id, "accept")}
            className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            Accept
          </button>
        </footer>
      )}
    </article>
  );
}
