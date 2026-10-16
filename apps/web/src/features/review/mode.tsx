import React from "react";
import type { Role } from "@latex-collab/contracts";

export type EditorMode = "edit" | "review" | "view";

export interface EditorModeSelectorProps {
  currentMode: EditorMode;
  userRole: Role;
  onModeChange: (mode: EditorMode) => void;
  disabled?: boolean;
}

export function EditorModeSelector({
  currentMode,
  userRole,
  onModeChange,
  disabled = false,
}: EditorModeSelectorProps) {
  // Determine available modes based on role
  const canDirectEdit = userRole === "OWNER" || userRole === "EDITOR";
  const canSuggest = userRole !== "VIEWER";

  const handleSelect = (mode: EditorMode) => {
    if (disabled) return;
    if (mode === "edit" && !canDirectEdit) return;
    if (mode === "review" && !canSuggest) return;
    onModeChange(mode);
  };

  return (
    <div
      className="editor-mode-selector inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 p-0.5 text-xs"
      role="radiogroup"
      aria-label="Editor working mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={currentMode === "edit"}
        disabled={disabled || !canDirectEdit}
        onClick={() => handleSelect("edit")}
        className={`px-3 py-1 rounded font-medium transition-colors ${
          currentMode === "edit"
            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
            : !canDirectEdit
              ? "text-gray-400 cursor-not-allowed opacity-60"
              : "text-gray-600 dark:text-gray-300 hover:text-gray-900"
        }`}
        title={!canDirectEdit ? "Direct editing is only allowed for Owners and Editors" : "Direct Edit Mode"}
      >
        ✏️ Edit
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentMode === "review"}
        disabled={disabled || !canSuggest}
        onClick={() => handleSelect("review")}
        className={`px-3 py-1 rounded font-medium transition-colors ${
          currentMode === "review"
            ? "bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm"
            : !canSuggest
              ? "text-gray-400 cursor-not-allowed opacity-60"
              : "text-gray-600 dark:text-gray-300 hover:text-gray-900"
        }`}
        title={!canSuggest ? "Viewers cannot propose suggestions" : "Review / Suggestion Mode"}
      >
        💬 Review
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentMode === "view"}
        disabled={disabled}
        onClick={() => handleSelect("view")}
        className={`px-3 py-1 rounded font-medium transition-colors ${
          currentMode === "view"
            ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
            : "text-gray-600 dark:text-gray-300 hover:text-gray-900"
        }`}
        title="Read-only View Mode"
      >
        👁️ View
      </button>
    </div>
  );
}
