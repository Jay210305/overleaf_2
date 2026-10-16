import { describe, it, expect, vi } from "vitest";
import { createEditorKeymap, searchAcrossFiles, previewReplace } from "@latex-collab/editor";

describe("Regression EDT-04 (S10-T10): Editor Shortcuts, Keymaps, and Search Actions", () => {
  it("registers standard shortcut callbacks without crashing", () => {
    const onSave = vi.fn();
    const onCompile = vi.fn();
    const onGoToLine = vi.fn();
    const onCommentToggle = vi.fn();

    const ext = createEditorKeymap({
      onSave,
      onCompile,
      onGoToLine,
      onCommentToggle,
    });

    expect(ext).toBeDefined();
  });

  it("searches across multiple files with exact matches and previews replacement", () => {
    const files = [
      { id: "1", name: "main.tex", content: "Here is a section.\nAnd another section." },
      { id: "2", name: "refs.bib", content: "@article{key, title={A section on physics}}" },
    ];

    const matches = searchAcrossFiles(files, { query: "section" });
    expect(matches).toHaveLength(3);

    expect(matches[0]?.fileName).toBe("main.tex");
    expect(matches[0]?.lineNumber).toBe(1);

    const preview = previewReplace(
      matches[0]!.lineContent,
      matches[0]!.startIndex,
      matches[0]!.endIndex,
      "chapter",
    );
    expect(preview).toBe("Here is a chapter.");
  });

  it("handles case-sensitive search across files", () => {
    const files = [{ id: "1", name: "main.tex", content: "LaTeX latex LATEX" }];

    const matchesExact = searchAcrossFiles(files, { query: "LaTeX", caseSensitive: true });
    expect(matchesExact).toHaveLength(1);

    const matchesInsensitive = searchAcrossFiles(files, { query: "LaTeX", caseSensitive: false });
    expect(matchesInsensitive).toHaveLength(3);
  });
});
