import { useState, type ReactElement } from "react";
import type { TagView } from "@latex-collab/contracts";

export interface TagPickerProps {
  tags: TagView[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string, selected: boolean) => void;
  onCreateTag?: ((name: string, color: string) => Promise<void> | void) | undefined;
  onDeleteTag?: ((tagId: string) => Promise<void> | void) | undefined;
  disabled?: boolean | undefined;
}

export function TagPicker({
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  disabled = false,
}: TagPickerProps): ReactElement {
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTagName.trim() || !onCreateTag) return;
    try {
      setIsCreating(true);
      await onCreateTag(newTagName.trim(), newTagColor);
      setNewTagName("");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" role="region" aria-label="Tag manager">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Project Tags</h3>

      {/* Existing tags list */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Available tags">
        {tags.length === 0 ? (
          <p className="text-xs text-zinc-500">No tags created yet.</p>
        ) : (
          tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? "ring-2 ring-zinc-900 dark:ring-zinc-100"
                    : "opacity-75 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  border: `1px solid ${tag.color}`,
                }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleTag(tag.id, !isSelected)}
                  aria-pressed={isSelected}
                  aria-label={`Tag ${tag.name}`}
                  className="cursor-pointer"
                >
                  {tag.name} {isSelected && "✓"}
                </button>
                {onDeleteTag && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onDeleteTag(tag.id)}
                    aria-label={`Delete tag ${tag.name}`}
                    className="ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create new tag */}
      {onCreateTag && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="New tag name"
            aria-label="New tag name"
            disabled={disabled || isCreating}
            className="rounded border border-zinc-300 px-2.5 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            aria-label="New tag color"
            disabled={disabled || isCreating}
            className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={disabled || isCreating || !newTagName.trim()}
            className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isCreating ? "Adding..." : "Add Tag"}
          </button>
        </div>
      )}
    </div>
  );
}
