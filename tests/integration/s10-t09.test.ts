import { describe, expect, it } from "vitest";
import {
  formatSymbolInsertion,
  LATEX_SYMBOLS,
  searchSymbols,
} from "../../packages/editor/src/symbols.js";
import {
  DEFAULT_PREFERENCES,
  loadEditorPreferences,
  saveEditorPreferences,
  type StoredEditorPreferences,
} from "../../apps/web/src/features/editor/preferences.js";

describe("S10-T09 Integration: Persist Editor Preferences and Symbols", () => {
  it("persists editor preferences to storage and survives reload", () => {
    const memoryStore = new Map<string, string>();
    const mockStorage: Storage = {
      getItem: (key) => memoryStore.get(key) ?? null,
      setItem: (key, val) => memoryStore.set(key, String(val)),
      removeItem: (key) => memoryStore.delete(key),
      clear: () => memoryStore.clear(),
      key: () => null,
      length: memoryStore.size,
    };

    const initial = loadEditorPreferences(mockStorage);
    expect(initial).toEqual(DEFAULT_PREFERENCES);

    const updated: StoredEditorPreferences = {
      ...DEFAULT_PREFERENCES,
      fontSize: 18,
      tabWidth: 4,
      theme: "dark",
      wrap: false,
      reducedMotion: true,
    };

    saveEditorPreferences(updated, mockStorage);

    // Simulate page reload
    const reloaded = loadEditorPreferences(mockStorage);
    expect(reloaded.fontSize).toBe(18);
    expect(reloaded.tabWidth).toBe(4);
    expect(reloaded.theme).toBe("dark");
    expect(reloaded.wrap).toBe(false);
    expect(reloaded.reducedMotion).toBe(true);
  });

  it("searches mathematical symbols by name, command, and category", () => {
    expect(LATEX_SYMBOLS.length).toBeGreaterThanOrEqual(30);

    const greek = searchSymbols("alpha", "greek");
    expect(greek).toHaveLength(1);
    expect(greek[0]?.command).toBe("\\alpha");
    expect(greek[0]?.unicodeChar).toBe("α");

    const relations = searchSymbols("equal", "relations");
    expect(relations.length).toBeGreaterThanOrEqual(1);

    const arrows = searchSymbols("arrow", "arrows");
    expect(arrows.length).toBeGreaterThanOrEqual(2);
  });

  it("formats symbol insertion with automatic math mode wrapping when necessary", () => {
    const alphaSym = searchSymbols("alpha")[0]!;
    // Outside math mode -> $...$
    expect(formatSymbolInsertion(alphaSym, false)).toBe("$\\alpha$");
    // Inside math mode -> plain macro
    expect(formatSymbolInsertion(alphaSym, true)).toBe("\\alpha");
  });
});
