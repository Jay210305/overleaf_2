import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  loadEditorPreferences,
  saveEditorPreferences,
} from "../../../apps/web/src/features/editor/preferences.js";

describe("ACC-05 Regression: Editor preferences persistence across reloads", () => {
  it("persists theme, font, tab width, wrap, and accessibility settings", () => {
    const memory = new Map<string, string>();
    const storage: Storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
      clear: () => memory.clear(),
      key: () => null,
      length: memory.size,
    };

    saveEditorPreferences(
      {
        ...DEFAULT_PREFERENCES,
        fontFamily: "JetBrains Mono",
        fontSize: 16,
        tabWidth: 4,
        wrap: false,
        theme: "dark",
        reducedMotion: true,
      },
      storage,
    );

    const reloaded = loadEditorPreferences(storage);
    expect(reloaded.fontFamily).toBe("JetBrains Mono");
    expect(reloaded.fontSize).toBe(16);
    expect(reloaded.tabWidth).toBe(4);
    expect(reloaded.wrap).toBe(false);
    expect(reloaded.theme).toBe("dark");
    expect(reloaded.reducedMotion).toBe(true);
  });
});
