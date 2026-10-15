import React, { useEffect, useState } from "react";
import {
  type SymbolCategory,
  searchSymbols,
  formatSymbolInsertion,
} from "@latex-collab/editor";

export interface StoredEditorPreferences {
  theme: "light" | "dark" | "system";
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  wrap: boolean;
  autoClose: boolean;
  autocomplete: boolean;
  reducedMotion: boolean;
  splitRatio: number;
  showPdf: boolean;
  showSidebar: boolean;
}

export const DEFAULT_PREFERENCES: StoredEditorPreferences = {
  theme: "system",
  fontFamily: "Fira Code, monospace",
  fontSize: 14,
  tabWidth: 2,
  wrap: true,
  autoClose: true,
  autocomplete: true,
  reducedMotion: false,
  splitRatio: 0.5,
  showPdf: true,
  showSidebar: true,
};

const STORAGE_KEY = "latex_collab_editor_prefs_v1";

/**
 * Loads preferences from localStorage or falls back to defaults (ACC-05).
 */
export function loadEditorPreferences(
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined,
): StoredEditorPreferences {
  if (!storage) return DEFAULT_PREFERENCES;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Persists preferences to localStorage (ACC-05).
 */
export function saveEditorPreferences(
  prefs: StoredEditorPreferences,
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * React hook for managing and persisting editor preferences across sessions.
 */
export function useEditorPreferences() {
  const [preferences, setPreferences] = useState<StoredEditorPreferences>(loadEditorPreferences);

  useEffect(() => {
    saveEditorPreferences(preferences);
  }, [preferences]);

  const updatePreference = <K extends keyof StoredEditorPreferences>(
    key: K,
    value: StoredEditorPreferences[K],
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  return { preferences, setPreferences, updatePreference };
}

export interface SymbolPaletteProps {
  onInsertSymbol?: (snippet: string) => void;
  inMathMode?: boolean;
}

/**
 * Symbol Palette component for browsing and inserting LaTeX math commands (EDT-10).
 */
export const SymbolPalette: React.FC<SymbolPaletteProps> = ({
  onInsertSymbol,
  inMathMode = false,
}) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SymbolCategory | undefined>(undefined);

  const symbols = searchSymbols(query, category);

  const categories: Array<{ id: SymbolCategory | undefined; label: string }> = [
    { id: undefined, label: "All" },
    { id: "greek", label: "Greek" },
    { id: "operators", label: "Operators" },
    { id: "relations", label: "Relations" },
    { id: "arrows", label: "Arrows" },
    { id: "calculus_logic", label: "Calculus/Logic" },
  ];

  return (
    <div
      className="symbol-palette p-3 bg-white dark:bg-gray-900 border rounded-md shadow-sm"
      role="region"
      aria-label="Symbol Palette"
    >
      <div className="flex gap-2 mb-3">
        <input
          type="search"
          placeholder="Search symbols (e.g. alpha, leq)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-3 py-1.5 border rounded text-xs bg-transparent border-gray-300 dark:border-gray-700"
          aria-label="Filter symbols"
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Symbol categories">
        {categories.map((cat) => (
          <button
            key={cat.label}
            type="button"
            role="tab"
            aria-selected={category === cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-2 py-1 text-xs rounded border ${
              category === cat.id
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div
        className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-56 overflow-y-auto p-1"
        role="grid"
        aria-label="Symbols list"
      >
        {symbols.map((sym) => (
          <button
            key={sym.command}
            type="button"
            title={`${sym.name} (${sym.command})`}
            aria-label={`${sym.name} ${sym.command}`}
            onClick={() => onInsertSymbol?.(formatSymbolInsertion(sym, inMathMode))}
            className="flex flex-col items-center justify-center p-2 border rounded text-sm hover:bg-blue-50 dark:hover:bg-blue-950 border-gray-200 dark:border-gray-700"
          >
            <span className="font-serif text-base">{sym.unicodeChar ?? sym.command}</span>
            <span className="text-[10px] text-gray-500 font-mono truncate max-w-full">
              {sym.command}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
