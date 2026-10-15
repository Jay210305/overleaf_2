import { useState, type ReactElement } from "react";
import type { TagView } from "@latex-collab/contracts";

export interface BulkActionsBarProps {
  selectedProjectIds: string[];
  onClearSelection: () => void;
  onBulkArchive: (projectIds: string[]) => Promise<void> | void;
  onBulkTrash: (projectIds: string[]) => Promise<void> | void;
  onBulkTag: (projectIds: string[], tagId: string) => Promise<void> | void;
  tags?: TagView[] | undefined;
  isProcessing?: boolean | undefined;
}

export function BulkActionsBar({
  selectedProjectIds,
  onClearSelection,
  onBulkArchive,
  onBulkTrash,
  onBulkTag,
  tags = [],
  isProcessing = false,
}: BulkActionsBarProps): ReactElement | null {
  const [selectedTagId, setSelectedTagId] = useState<string>("");

  if (selectedProjectIds.length === 0) {
    return null;
  }

  const handleApplyTag = async () => {
    if (!selectedTagId) return;
    await onBulkTag(selectedProjectIds, selectedTagId);
    setSelectedTagId("");
  };

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        {selectedProjectIds.length} selected
      </span>

      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />

      {/* Bulk Archive */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={() => onBulkArchive(selectedProjectIds)}
        className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Archive
      </button>

      {/* Bulk Trash */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={() => onBulkTrash(selectedProjectIds)}
        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        Move to Trash
      </button>

      {/* Bulk Tag */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            disabled={isProcessing}
            aria-label="Select tag to apply"
            className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">Choose tag...</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isProcessing || !selectedTagId}
            onClick={handleApplyTag}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
          >
            Apply Tag
          </button>
        </div>
      )}

      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />

      {/* Deselect / Cancel */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={onClearSelection}
        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        Clear
      </button>
    </div>
  );
}
